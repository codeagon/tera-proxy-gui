//todo: add comments

const fs = require('fs')
const path = require('path')
const url = require('url')
const electron = require('electron')
const { app, ipcMain, Menu, Tray } = require('electron')

const debug = true
if (debug) console.log(`Running Node.js ${process.versions.node} on Electron ${process.versions.electron} (Chromium ${process.versions.chrome})` + '\r\n')

let config
try { config = require('./config.json') }
catch (e) { config = { "region": "EU", "autostart": false, "theme": "dark" } }

const icon = path.join(__dirname, 'www/img/icon.png')

let trayWindow,
	tray,
	proxystate = '0',
	states = ['Start Proxy', 'Stop Proxy', 'err check logs'],
	trayWindowsisopen = false

global.debug = debug
global.config = config

app.on('ready', () => {
	tray = new Tray(icon)
	tray.setToolTip('Tera Proxy (WIP)')
	tray.setContextMenu(contextMenu)

	tray.on('click', () => {
		if (!trayWindowsisopen) {
			showtrayWindow()
			trayWindowsisopen = true
		}
		if (debug) trayWindow.show()
	})

	ipcMain.on('loaded', () => {
		state()
		proxystate === '1' ? trayWindow.webContents.send('modules', modules) : populateModulesList()
	})

	ipcMain.on('proxy', (event, r) => {
		config.region = r
		switch (proxystate) {
			case '0': ChecksAndStart(); break
			case '1': cleanExit(); break
		}
	})

	ipcMain.on('config', (event, c) => {
		config = c
		fs.writeFileSync('./bin/config.json', JSON.stringify(config, null, "\t"))
	})

	ipcMain.on('refresh modules', () => {
		proxystate === '0' ? populateModulesList() : trayWindow.webContents.send('modules', modules)
	})

	ipcMain.on('toggle module', (event, name) => {
		togglemodule(name)
	})

	if (config.autostart) ChecksAndStart()
})

function showtrayWindow() {
	let xy = getTraypos(),
		x = xy[0],
		y = xy[1]

	trayWindow = new electron.BrowserWindow({
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

	trayWindow.loadURL(url.format({
		pathname: path.join(__dirname, 'www/index.html')
	}))

	if (debug) trayWindow.webContents.openDevTools({ mode: 'detach' })

	trayWindow.on('blur', () => {
		if (!debug) {
			trayWindow.hide()
			trayWindowsisopen = false
		}
	})
}

function getTraypos() {
	let t = tray.getBounds(),
		{ width, height } = electron.screen.getPrimaryDisplay().workAreaSize,
		x = t.x >= width / 2 ? true : false,
		y = t.y >= height / 2 ? true : false,
		traypos

	if (x && !y) traypos = 'top'
	if (!x && y) traypos = 'left'
	if (x && y) traypos = t.x < width - 150 ? 'bottom' : 'right'

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
			if (proxystate === '1') cleanExit()
			app.exit()
		}
	}
])

function togglemodule(name) {
	for (let i = 0, len = modules.length; i < len; ++i) {
		if (modules[i][0] === name) {
			if (proxystate === '0') modules[i][1] = !modules[i][1]
			else if (proxystate === '1') {
				if (!modules[i][1]) {
					if (connection.dispatch.load(name, module) !== null) {
						modules[i][1] = true
					}
				}
				else {
					delete require.cache[require.resolve(name)]
					connection.dispatch.unload(name)
					modules[i][1] = false
				}
			}
		}
	}

	trayWindow.webContents.send('modules', modules)
}

function state(s) {
	proxystate = s || proxystate
	if (trayWindowsisopen) trayWindow.webContents.send('state', states[proxystate])
}

/*
 * TERA PROXY 
 */

const regions = require('./regions')
const hosts = require('./hosts')

const { Connection, RealClient } = require('tera-proxy-game')

let currentRegion,
	listenHostname,
	hostname,
	customServers,
	servers,
	proxy,
	connection

function ChecksAndStart() {
	currentRegion = regions[config.region]

	if (!currentRegion) {
		console.error('Unsupported region:', config.region)
		return
	} else {
		console.log('[sls] Tera-Proxy configured for region:', config.region)
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
		state('2')
		return
	}
	startProxy()
}

const moduleBase = path.join(__dirname, '..', 'node_modules')
let modules = []

function populateModulesList() {
	for (let i = 0, k = -1, arr = fs.readdirSync(moduleBase), len = arr.length; i < len; ++i) {
		const name = arr[i]
		if (name[0] === '.' || name[0] === '_') continue
		modules[++k] = [name, true]
	}
	trayWindow.webContents.send('modules', modules)
}

const SlsProxy = require('tera-proxy-sls')

function startProxy() {
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

	state('1')
}

function customServerCallback(server) {
	const { address, port } = server.address()
	console.log(`[game] listening on ${address}:${port}`)
}

function listenHandler(err) {
	if (err) {
		const { code } = err
		if (code === 'EADDRINUSE') {
			console.error('ERROR: Another instance of TeraProxy is already running, please close it then try again.')
			process.exit()
		}
		else if (code === 'EACCES') {
			let port = currentRegion.port
			console.error('ERROR: Another process is already using port ' + port + '.\nPlease close or uninstall the application first:')
			return require('./netstat')(port)
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

function createServ(target, socket) {
	socket.setNoDelay(true)

	connection = new Connection()
	const client = new RealClient(connection, socket)
	const srvConn = connection.connect(client, {
		host: target.ip,
		port: target.port
	})

	for (let i = 0, len = modules.length; i < len; ++i)
		if (modules[i][1]) connection.dispatch.load(modules[i][0], module)

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
}

function cleanExit() {
	console.log('closing proxy...')
	try { hosts.remove(listenHostname, hostname) }
	catch (_) { }
	proxy.close()
	for (let i = servers.values(), step; !(step = i.next()).done;) step.value.close()
	state('0')
}