const request = require('request-promise-native');
const crypto = require('crypto');
const fs = require("fs");
const path = require("path");

const TeraDataAutoUpdateServer = "https://raw.githubusercontent.com/hackerman-caali/tera-data/master/";
const DiscordURL = "https://discord.gg/maqBmJV";

function forcedirSync(dir) {
  const sep = path.sep;
  const initDir = path.isAbsolute(dir) ? sep : '';
  dir.split(sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(parentDir, childDir);
    try {
      fs.mkdirSync(curDir);
    } catch (err) {

    }

    return curDir;
  }, initDir);
}

async function autoUpdateFile(file, filepath, url, drmKey) {
  try {
    const updatedFile = await request({url: url, qs: {"drmkey": drmKey}, encoding: null});

    forcedirSync(path.dirname(filepath));
    fs.writeFileSync(filepath, updatedFile);
    return [file, true, ""];
  } catch (e) {
    return [file, false, e];
  }
}

async function autoUpdateModule(name, root, updateData, updatelog, serverIndex = 0) {
  try {
    const manifest_url = updateData["servers"][serverIndex] + 'manifest.json';
    if(updatelog) {
      console.log("[update] Updating module " + name);
      console.log("[update] - Retrieving update manifest (Server " + serverIndex + ")");
    }

    const manifest = await request({url: manifest_url, qs: {"drmkey": updateData["drmKey"]}, json: true});
    if(typeof manifest !== 'object')
      throw "Invalid manifest.json!";

    let promises = [];
    for(let file in manifest["files"]) {
      let filepath = path.join(root, file);
      let filedata = manifest["files"][file];
      let needsUpdate = !fs.existsSync(filepath);
      if(!needsUpdate) {
        if(typeof filedata === 'object') {
          needsUpdate = filedata["overwrite"] && (crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest().toString("hex").toUpperCase() !== filedata["hash"].toUpperCase());
        } else {
          needsUpdate = (crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest().toString("hex").toUpperCase() !== filedata.toUpperCase());
        }
      }
      if(needsUpdate) {
        const file_url = updateData["servers"][serverIndex] + file;
        if(updatelog)
          console.log("[update] - " + file);
        promises.push(autoUpdateFile(file, filepath, file_url, updateData["drmKey"]));
      }
    }

    return {"defs": manifest["defs"], "results": await Promise.all(promises)};
  } catch(e) {
    if(serverIndex + 1 < updateData["servers"].length)
        return autoUpdateModule(name, root, updateData, updatelog, serverIndex + 1);
    else
        return Promise.reject(e);
  }
}

async function autoUpdateDef(def, filepath, filepath_pc, filepath_con) {
  // First try platform-agnostic version
  let res = await autoUpdateFile(def, filepath, TeraDataAutoUpdateServer + "protocol/" + def);
  if (res[1])
    return res;

  // Then try platform-specific versions
  let res_pc = await autoUpdateFile(def, filepath_pc, TeraDataAutoUpdateServer + "protocol/" + def.replace('.def', '.pc.def'));
  let res_con = await autoUpdateFile(def, filepath_con, TeraDataAutoUpdateServer + "protocol/" + def.replace('.def', '.con.def'));
  return [def, res_pc[1] && res_con[1], !res_pc[1] ? res_pc[2] : (!res_con[1] ? res_con[2] : "")];
}

async function autoUpdateDefs(requiredDefs, updatelog) {
  let promises = [];

  if(updatelog)
    console.log("[update] Updating defs");

  for(let def of requiredDefs) {
    let filepath = path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'protocol', def);
    if(!fs.existsSync(filepath)) {
      let filepath_pc = filepath.replace('.def', '.pc.def');
      let filepath_con = filepath.replace('.def', '.con.def');

      if(!fs.existsSync(filepath_pc) || !fs.existsSync(filepath_con))
      {
        if(updatelog)
          console.log("[update] - " + def);
        promises.push(autoUpdateDef(def, filepath, filepath_pc, filepath_con));
      }
    }
  }

  return promises;
}

async function autoUpdateMaps(updatelog) {
  let promises = [];

  if(updatelog)
    console.log("[update] Updating maps");

  const mappings = await request({url: TeraDataAutoUpdateServer + 'mappings.json', json: true});
  for(let region in mappings) {
    let mappingData = mappings[region];
    let protocol_name = 'protocol.' + mappingData["version"].toString() + '.map';
    let sysmsg_name = 'sysmsg.' + mappingData["version"].toString() + '.map';

    let protocol_custom_filename = path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'map', protocol_name);
    if(!fs.existsSync(protocol_custom_filename)) {
      forcedirSync(path.dirname(protocol_custom_filename));
      fs.closeSync(fs.openSync(protocol_custom_filename, 'w'));
    }

    let protocol_filename = path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'map_base', protocol_name);
    if(!fs.existsSync(protocol_filename) || crypto.createHash("sha256").update(fs.readFileSync(protocol_filename)).digest().toString("hex").toUpperCase() !== mappingData["protocol_hash"].toUpperCase()) {
      if(updatelog)
        console.log("[update] - " + protocol_name);
      promises.push(autoUpdateFile(protocol_name, protocol_filename, TeraDataAutoUpdateServer + "map_base/" + protocol_name));
    }

    let sysmsg_filename = path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'map_base', sysmsg_name);
    if(!fs.existsSync(sysmsg_filename) || crypto.createHash("sha256").update(fs.readFileSync(sysmsg_filename)).digest().toString("hex").toUpperCase() !== mappingData["sysmsg_hash"].toUpperCase()) {
      if(updatelog)
        console.log("[update] - " + sysmsg_name);
      promises.push(autoUpdateFile(sysmsg_name, sysmsg_filename, TeraDataAutoUpdateServer + "map_base/" + sysmsg_name));
    }
  }

  return promises;
}

async function autoUpdate(moduleBase, modules, updatelog) {
  console.log("[update] Auto-update started!");
  let requiredDefs = new Set(["C_CHECK_VERSION.1.def"]);

  let successModules = [];
  let legacyModules = [];
  let failedModules = [];
  for (let module of modules) {
    if(!module.endsWith('.js')) {
      let root = path.join(moduleBase, module);
      try {
        let updateData = fs.readFileSync(path.join(root, 'module.json'), 'utf8');
        try {
          updateData = JSON.parse(updateData);
          try {
            const moduleConfig = await autoUpdateModule(module, root, updateData, updatelog);
            for(let def in moduleConfig["defs"])
              requiredDefs.add(def + "." + moduleConfig["defs"][def].toString() + ".def");

            let failedFiles = [];
            for(let result of moduleConfig["results"]) {
              if(!result[1]) {
                failedFiles.push(result[0]);
                failedFiles.push(result[2]);
              }
            }


            if(failedFiles.length > 0)
              throw "Failed to update the following module files:\n - " + failedFiles.join("\n - ");

            successModules.push(module);
          } catch(e) {
            console.error("ERROR: Unable to auto-update module %s:\n%s", module, e);
            if(updateData["supportUrl"]) {
              console.error("Please go to %s and follow the given instructions or ask for help.", updateData["supportUrl"]);
              if(updateData["supportUrl"] !== DiscordURL)
                console.error("Alternatively, join %s and ask in the #help channel.", DiscordURL);
            } else {
              console.error("Please contact the module author or join %s and ask in the #help channel.", DiscordURL);
            }

            failedModules.push(module);
          }
        } catch(e) {
          console.error("ERROR: Failed to parse auto-update configuration for module %s:\n%s", module, e);
          failedModules.push(module);
        }
      } catch(_) {
        // legacy module without auto-update functionality
        legacyModules.push(module);
      }
    } else {
      legacyModules.push(module);
    }
  }

  let updatePromises = await autoUpdateDefs(requiredDefs, updatelog);
  updatePromises = updatePromises.concat(await autoUpdateMaps(updatelog));

  let results = await Promise.all(updatePromises);
  let failedFiles = [];
  for(let result of results) {
    if(!result[1])
      failedFiles.push(result[0]);
  }

  if(failedFiles.length > 0)
    console.error("ERROR: Unable to update the following def/map files. Please join %s and report this error in the #help channel!\n - %s", DiscordURL, failedFiles.join('\n - '));

  console.log("[update] Auto-update complete!");
  return {"tera-data": (failedFiles.length == 0), "updated": successModules, "legacy": legacyModules, "failed": failedModules};
}

module.exports = autoUpdate;