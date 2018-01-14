const fs = require('fs')
const path = require('path')
const url = require('url')
const electron = require('electron')
const { app, ipcMain, Menu, Tray } = require('electron')

const debug = true

let config
try { config = require('./config.json') }
catch (e) { config = { "region": "EU", "autostart": false, "theme": "dark" } }

try { fs.readdirSync(path.join(__dirname, '..', 'node_modules', 'tera-data', 'map')) }
catch (e) { fs.mkdirSync(path.join(__dirname, '..', 'node_modules', 'tera-data', 'map')) }

const icon = path.join(__dirname, 'www/img/icon.png')

let mainWindow,
	tray,
	proxystate = 0,
	states = ['Start Proxy', 'Stop Proxy', 'err check logs', 'starting...'],
	mainWindowsisopen = false

global.debug = debug
global.config = config

app.on('ready', () => {
	tray = new Tray(icon)
	tray.setToolTip('Tera Proxy (WIP)')
	tray.setContextMenu(contextMenu)

	tray.on('click', () => {
		if (!mainWindowsisopen) {
			showMainWindow()
			mainWindowsisopen = true
		}
		if (debug) mainWindow.show()
	})

	ipcMain.on('loaded', () => {
		state()
		populateModulesList()
	})

	ipcMain.on('proxy', () => {
		switch (proxystate) {
			case 0: slsProxy()
			case 1: cleanExit()
		}
	})

	ipcMain.on('config', (event, c) => {
		config = c
		fs.writeFileSync('./bin/config.json', JSON.stringify(config, null, "\t"))
	})

	ipcMain.on('refresh modules', () => {
		if (proxystate === 0) populateModulesList()
	})

	ipcMain.on('toggle module', (event, name) => {
		togglemodule(name)
	})

	if (config.autostart) slsProxy(config.region)
})

function showMainWindow() {
	let xy = getTraypos(),
		x = xy[0],
		y = xy[1]

	mainWindow = new electron.BrowserWindow({
		width: 250,
		height: 400,
		minWidth: 250,
		minHeight: 400,
		x: x,
		y: y,
		resizable: debug,
		title: 'Tera Proxy (WIP)',
		icon: icon,
		frame: false,
		backgroundColor: config.theme === 'dark' ? '#14171A' : '#FFF'
	})

	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, 'www/index.html')
	}))

	if (debug) mainWindow.webContents.openDevTools({ mode: 'detach' })

	mainWindow.on('blur', () => {
		if (!debug) {
			mainWindow.hide()
			mainWindowsisopen = false
		}
	})
}

function getTraypos() {
	let t = tray.getBounds(),
		{ width, height } = electron.screen.getPrimaryDisplay().workAreaSize,
		x = t.x >= width / 2 ? true : false,
		y = t.y >= height / 2 ? true : false,
		traypos

	if (x && !y) {
		traypos = 'top'
	}
	else if (!x && y) {
		traypos = 'left'
	}
	else if (x && y) {
		traypos = t.x < width - 150 ? 'bottom' : 'right'
	}

	switch (traypos) {
		case 'top':
			return [t.x + (t.width / 2) - 125, t.y]
		case 'left':
			return [t.x + t.width, t.y + (t.height / 2) - 200]
		case 'bottom':
			return [t.x + (t.width / 2) - 125, t.y - 400]
		case 'right':
			return [t.x - 250, t.y + (t.height / 2) - 200]
		default:
			console.error(`[gui] idk where the fuck is ur tray bar, i'm spawning the window in middle of ur screen k`)
			return [(width / 2) - 125, (height / 2) - 200]
	}
}

var contextMenu = Menu.buildFromTemplate([
	{
		label: 'Quit',
		click: () => {
			if (proxystate === 1) cleanExit()
			app.exit()
		}
	}
])

function togglemodule(name) {
	try {
		for (let i = 0, len = modules.length; i < len; ++i)
			if (modules[i][0] === name) {
				modules[i][1] = !modules[i][1]
				if (proxystate === 1) {
					console.log(`${modules[i][1] ? 'en' : 'dis'}abling ${name}`)
					modules[i][1] ? connection.dispatch.load(name, 'modules') : connection.dispatch.unload(name)
				}
			}
	} catch (e) {
		for (let i = 0, len = modules.length; i < len; ++i)
			if (modules[i][0] === name) {
				console.log(`error while ${modules[i][1] ? 'en' : 'dis'}abling ${name}`)
				modules[i][1] = !modules[i][1]
			}
	}
	mainWindow.webContents.send('modules', modules)
}

function state(s) {
	proxystate = s || proxystate
	if (mainWindowsisopen) mainWindow.webContents.send('state', states[proxystate])
}

/*
 * TERA PROXY 
 */

// todo: clean that shit

const regions = require('./lib/regions')
const hosts = require('./lib/hosts')

const SlsProxy = require('tera-proxy-sls')
const { Connection, RealClient } = require('tera-proxy-game')

const moduleBase = path.join(__dirname, 'node_modules')

let currentRegion,
	customServers,
	listenHostname,
	hostname,
	modules,
	servers,
	proxy

function slsProxy() {
	currentRegion = regions[config.region]

	if (!currentRegion) {
		console.error('Unsupported region:', config.region)
		return
	} else {
		console.log('[sls] Tera-Proxy configured for region %s', config.region)
	}

	listenHostname = currentRegion.listenHostname
	hostname = currentRegion.hostname
	customServers = currentRegion.customServers

	try { hosts.remove(listenHostname, hostname) }
	catch (e) {
		switch (e.code) {
			case 'EACCES':
				console.error(`ERROR: Hosts file is set to read-only.
		
		* Make sure no anti-virus software is running.
		* Locate '${e.path}', right click the file, click 'Properties', uncheck 'Read-only' then click 'OK'.`)
				break
			case 'EPERM':
				console.error(`ERROR: Insufficient permission to modify hosts file.
		
		* Make sure no anti-virus software is running.
		* Right click TeraProxy.bat and select 'Run as administrator'.`)
				break
			default:
				throw e
		}
		state(2)
		return
	}

	servers = new Map()
	proxy = new SlsProxy(currentRegion)

	require('dns').setServers(['8.8.8.8', '8.8.4.4'])

	proxy.fetch((err, gameServers) => {
		if (err) throw err

		for (let i = 0, arr = Object.keys(customServers), len = arr.length; i < len; ++i) {
			const id = arr[i]
			const target = gameServers[id]
			if (!target) {
				console.error('server %s not found', id)
				continue
			}

			const server = require('net').createServer(createServ.bind(null, target))
			servers.set(id, server)
		}
		proxy.listen(listenHostname, listenHandler)
	})
}

function createServ(target, socket) {
	socket.setNoDelay(true)

	const connection = new Connection()
	const client = new RealClient(connection, socket)
	const srvConn = connection.connect(client, {
		host: target.ip,
		port: target.port
	})

	for (let i = 0, len = modules.length; i < len; ++i)
		if (modules[i][1]) connection.dispatch.load(modules[i][0])

	let remote = '???'

	socket.on('error', console.warn)

	srvConn.on('connect', () => {
		remote = socket.remoteAddress + ':' + socket.remotePort
		console.log('[connection] routing %s to %s:%d', remote, srvConn.remoteAddress, srvConn.remotePort)
	})

	srvConn.on('error', console.warn)

	srvConn.on('close', () => {
		console.log('[connection] %s disconnected', remote)
		console.log('[proxy] unloading user modules')
		for (let i = 0, arr = Object.keys(require.cache), len = arr.length; i < len; ++i)
			if (arr[i].startsWith(moduleBase))
				delete require.cache[arr[i]]
	})

	state(1)
}

function listenHandler(err) {
	if (err) {
		const { code } = err
		if (code === 'EADDRINUSE') {
			console.error('ERROR: Another instance of TeraProxy is already running, please close it then try again.')
			process.exit()
		}
		else if (code === 'EACCES') {
			console.error('ERROR: Another process is already using port %s.\nPlease close or uninstall the application first:', currentRegion.port)
			return require('./netstat')()
		}
		throw err
	}

	hosts.set(listenHostname, hostname)
	console.log('[sls] server list overridden')

	for (let i = servers.entries(), step; !(step = i.next()).done;) {
		const [id, server] = step.value
		const currentCustomServer = customServers[id]
		server.listen(currentCustomServer.port, currentCustomServer.ip || '127.0.0.1', customServerCallback.bind(null, server))
	}
}

function customServerCallback(server) {
	const { address, port } = server.address()
	console.log(`[game] listening on ${address}:${port}`)
}

function populateModulesList() {
	modules = fs.readdirSync(moduleBase)
	for (let m in modules)
		modules[m].charAt(0) === '_' ? modules[m] = [modules[m].substr(1, modules[m].length), false] : modules[m] = [modules[m], true]
	mainWindow.webContents.send('modules', modules)
}

function cleanExit() {
	console.log('closing proxy...')
	try { hosts.remove(listenHostname, hostname) }
	catch (_) { }
	proxy.close()
	for (let i = servers.values(), step; !(step = i.next()).done;) {
		step.value.close()
		console.log(step.value)
	}
	state(0)
}