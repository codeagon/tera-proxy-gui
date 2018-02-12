const fs = require('fs')
const path = require('path')
const electron = require('electron')
const { app, ipcMain, Menu, Tray } = require('electron')
const proxy = require('./proxy')

const debug = true
if (debug) console.log(`Running Electron ${process.versions.electron} (Node.js ${process.versions.node})` + '\r\n')
global.debug = debug

let config
try { config = require('./config.json') }
catch (e) { config = { 'region': 'EU' } }
global.config = config

const icon = path.join(__dirname, 'www/img/icon.png')

let window,
	tray,
	proxyIsOn = false

let modules = proxy.populateModulesList(),
	LoadedModules = []

try {
	CACHE = require('../cache.json')
	for (m in modules) if (CACHE.includes(modules[m])) LoadedModules.push(modules[m])
} catch (e) { }

app.on('ready', () => {
	window = new electron.BrowserWindow({
		width: 250,
		height: 400,
		minWidth: 250,
		minHeight: 400,
		resizable: debug,
		title: 'Tera Proxy (WIP)',
		icon: icon,
		frame: false
	})

	window.loadURL(`file://${__dirname}/www/index.html`)

	if (debug) window.webContents.openDevTools({ mode: 'detach' })

	window.on('blur', () => {
		if (debug) return
		window.hide()
	})

	tray = new Tray(icon)
	tray.setToolTip('Tera Proxy (WIP)')
	tray.setContextMenu(contextMenu)

	tray.on('click', () => {
		window.show()
	})

	ipcMain.on('loaded', () => {
		modules = proxy.populateModulesList()
		window.webContents.send('modules', modules, LoadedModules)
		window.webContents.send('state', proxyIsOn)
	})

	ipcMain.on('proxy', (event) => {
		if (!proxyIsOn) {
			proxy.Start(config.region, LoadedModules)
			proxyIsOn = true
		} else {
			proxy.Exit()
			proxyIsOn = false
		}
		window.webContents.send('state', proxyIsOn)
	})

	ipcMain.on('config', (event, c) => {
		config = c
		fs.writeFileSync('./bin/config.json', JSON.stringify(config, null, '\t'))
	})

	ipcMain.on('refresh modules', () => {
		modules = proxy.populateModulesList()
		window.webContents.send('modules', modules, LoadedModules)
	})

	ipcMain.on('toggle module', (event, name) => {
		togglemodule(name)
	})

	ipcMain.on('change region', (event, r) => {
		config.region = r
		fs.writeFileSync('./bin/config.json', JSON.stringify(config, null, '\t'))
	})
})

var contextMenu = Menu.buildFromTemplate([
	{
		label: 'Quit',
		click: () => {
			if (proxyIsOn) proxy.Exit()
			app.exit()
		}
	}
])

function togglemodule(name) {
	if (LoadedModules.includes(name)) {
		if (name === 'command') return
		if (proxyIsOn) proxy.unloadModule(name)
		LoadedModules = LoadedModules.filter(e => e !== name)
	} else {
		if (proxyIsOn) {
			if (proxy.loadModule(name))
				LoadedModules.push(name)
		} else {
			LoadedModules.push(name)
		}
	}
	window.webContents.send('modules', modules, LoadedModules)
	fs.writeFileSync('./bin/cache.json', JSON.stringify(LoadedModules, null, '\t'))
}