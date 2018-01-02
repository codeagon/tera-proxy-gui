const request = require('request-promise-native');
const crypto = require('crypto');
const fs = require("fs");
const path = require("path");

const TeraDataAutoUpdateServer = "https://raw.githubusercontent.com/hackerman-caali/tera-data/master/";
const DiscordURL = "https://discord.gg/maqBmJV";

async function autoUpdateFile(file, filepath, url, drmKey) {
  try {
    const updatedFile = await request({url: url, qs: {"drmkey": drmKey}, encoding: null});

    let dir = path.dirname(filepath);
    if (!fs.existsSync(dir))
      fs.mkdirSync(dir);
    fs.writeFileSync(filepath, updatedFile);
    return [file, true, ""];
  } catch (e) {
    return [file, false, e];
  }
}

async function autoUpdateModule(root, updateData, serverIndex = 0) {
  try {
    const manifest = await request({url: updateData["servers"][serverIndex] + 'manifest.json', qs: {"drmkey": updateData["drmKey"]}, json: true});
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
      if(needsUpdate)
        promises.push(autoUpdateFile(file, filepath, updateData["servers"][serverIndex] + file, updateData["drmKey"]));
    }

    return {"defs": manifest["defs"], "results": await Promise.all(promises)};
  } catch(e) {
    if(serverIndex + 1 < updateData["servers"].length)
        return autoUpdateModule(root, updateData, serverIndex + 1);
    else
        return Promise.reject(e);
  }
}

async function autoUpdateDefs(requiredDefs) {
  let promises = [];

  for(let def of requiredDefs) {
    let filepath = path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'protocol', def);
    if(!fs.existsSync(filepath))
      promises.push(autoUpdateFile(def, filepath, TeraDataAutoUpdateServer + "protocol/" + def));
  }

  return promises;
}

async function autoUpdateMaps() {
  let promises = [];

  const mappings = await request({url: TeraDataAutoUpdateServer + 'mappings.json', json: true});
  for(let region in mappings) {
    let mappingData = mappings[region];
    let protocol_name = 'protocol.' + mappingData["version"].toString() + '.map';
    let sysmsg_name = 'sysmsg.' + mappingData["version"].toString() + '.map';

    let protocol_custom_filename = path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'map', protocol_name);
    if(!fs.existsSync(protocol_custom_filename))
      fs.closeSync(fs.openSync(protocol_custom_filename, 'w'));

    let protocol_filename = path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'map_base', protocol_name);
    if(!fs.existsSync(protocol_filename) || crypto.createHash("sha256").update(fs.readFileSync(protocol_filename)).digest().toString("hex").toUpperCase() !== mappingData["protocol_hash"].toUpperCase())
      promises.push(autoUpdateFile(protocol_name, protocol_filename, TeraDataAutoUpdateServer + "map_base/" + protocol_name));

    let sysmsg_filename = path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'map_base', sysmsg_name);
    if(!fs.existsSync(sysmsg_filename) || crypto.createHash("sha256").update(fs.readFileSync(sysmsg_filename)).digest().toString("hex").toUpperCase() !== mappingData["sysmsg_hash"].toUpperCase())
      promises.push(autoUpdateFile(sysmsg_name, sysmsg_filename, TeraDataAutoUpdateServer + "map_base/" + sysmsg_name));
  }

  return promises;
}

async function autoUpdate(moduleBase, modules) {
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
            const moduleConfig = await autoUpdateModule(root, updateData);
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

  let updatePromises = await autoUpdateDefs(requiredDefs);
  updatePromises.concat(await autoUpdateMaps());

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