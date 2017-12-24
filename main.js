const path = require('path')
const url = require('url')
const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron')
const { spawn } = require('child_process')

const icon = path.join(__dirname, 'bin/GUI/icon.png')

let ProxyWindow = null,
	tray = null,
	proxy = null,
	proxyisopen = false

app.on('ready', () => {
	ProxyWindow = new BrowserWindow({
		title: 'Tera Proxy (WIP)',
		width: 1000,
		height: 600,
		icon: icon,
		frame: false,
		backgroundColor: '#292F33',
		resizable: false
	})
	ProxyWindow.loadURL(url.format({
		pathname: path.join(__dirname, 'bin/GUI/index.html')
	}))
	ProxyWindow.on('minimize', () => {
		ProxyWindow.hide()
	})

	tray = new Tray(icon)
	tray.setToolTip('Tera Proxy (WIP)')
	tray.setContextMenu(contextMenu)
	tray.on('click', () => {
		ProxyWindow.isVisible() ? ProxyWindow.hide() : ProxyWindow.show()
	})

	ipcMain.on('run proxy', (event, region) => {
		runproxy(region)
		proxy.stdout.on('data', (data) => {
			console.log(data.toString())
			ProxyWindow.webContents.send('proxy-log', data)
		})
		proxy.stderr.on('data', (data) => {
			console.log(data.toString())
			ProxyWindow.webContents.send('proxy-log', data)
		})
	})

	ipcMain.on('close proxy', () => {
		closeproxy()
	})
})

function runproxy(region) {
	if (proxyisopen) return
	proxy = spawn('node', [path.join(__dirname, './bin/lib/proxy.js'), region])
	proxyisopen = true
}

function closeproxy() {
	if (!proxyisopen) return
	spawn('taskkill', ['/pid', proxy.pid, '/f', '/t'])
	proxyisopen = false
}

var contextMenu = Menu.buildFromTemplate([
	{
		label: 'Quit',
		click: () => {
			proxyisopen ? closeproxy() : ''
			app.exit()
		}
	}
])