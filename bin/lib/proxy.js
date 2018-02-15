'use strict'
const fs = require('fs')
const path = require('path')
const hosts = require('./hosts')

const update = false

try { fs.readdirSync(path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'map')) }
catch (e) { fs.mkdirSync(path.join(__dirname, '..', '..', 'node_modules', 'tera-data', 'map')) }

let currentRegion

function Start(region, m) {
	modules = m
	currentRegion = require('./regions')[region]

	if (!currentRegion) {
		console.error('Unsupported region:', region)
		return
	} else {
		console.log('[sls] Tera-Proxy configured for region:', region)
	}

	try { hosts.remove(currentRegion.listenHostname, currentRegion.hostname) }
	catch (e) {
		switch (e.code) {
			case 'EACCES':
				console.error(`ERROR: Hosts file is set to read-only.

* Make sure no anti-virus software is running.
* Locate "${e.path}", right click the file, click 'Properties', uncheck 'Read-only' then click 'OK'.`)
				break
			case 'EPERM':
				console.error(`ERROR: Insufficient permission to modify hosts file.

* Make sure no anti-virus software is running.
* Right click TeraProxy.bat and select 'Run as administrator'.`)
				break
			default:
				throw e
		}

		process.exit(1)
	}

	if (update) {
		require('./update')(moduleBase, populateModulesList(), true).then((updateResult) => {
			if (!updateResult['tera-data']) console.log('WARNING: There were errors updating tera-data. This might result in further errors.')
			runSlsProxy()
		}).catch((e) => {
			console.log('ERROR: Unable to auto-update:', e)
		})
	} else {
		runSlsProxy()
	}
}

const moduleBase = path.join(__dirname, '..', 'node_modules')
let modules

function populateModulesList() {
	let M = fs.readdirSync(moduleBase)
	for (var m = M.length - 1; m >= 0; m--)
		if (M[m][0] === '.' || M[m][0] === '_') M.splice(m, 1)
	return M
}

function customServerCallback(server) {
	const { address, port } = this.address()
	console.log(`[game] listening on ${address}:${port}`)
}

function listenHandler(err) {
	if (err) {
		const { code } = err
		if (code === 'EADDRINUSE') {
			console.error('ERROR: Another instance of TeraProxy is already running, please close it then try again.')
			process.exit()
		} else if (code === 'EACCES') {
			let port = currentRegion.port
			console.error(`ERROR: Another process is already using port ${port}.\nPlease close or uninstall the application first:`)
			return require('./netstat')(port)
		}
		throw err
	}

	hosts.set(currentRegion.listenHostname, currentRegion.hostname)
	console.log('[sls] server list overridden')

	for (let i = servers.entries(), step; !(step = i.next()).done;) {
		const [id, server] = step.value
		const currentCustomServer = currentRegion.customServers[id]
		server.listen(currentCustomServer.port, currentCustomServer.ip || '127.0.0.1', customServerCallback)
	}
}

function clearUserModules(children) {
	const childModules = Object.create(null)
	let doChildModules
	const cache = children || require.cache
	let keys = Object.keys(cache),
		i = keys.length
	while (~--i) {
		const key = keys[i],
			_module = cache[key]
		if (!key.startsWith(moduleBase)) {
			const { parent } = _module
			if (parent && String(parent.id).startsWith(moduleBase)) {
				_module.parent = void 0
			}
			continue
		}
		const arr = _module.children
		if (arr && arr.length) {
			doChildModules = true
			for (let i = 0, len = arr.length; i < len; ++i) {
				const child = arr[i]
				const id = child.id
				childModules[id] = child
			}
		}
		delete cache[key]
	}
	return doChildModules ? clearUserModules(childModules) : void 0
}

function onServerConnect() {
	const state = stateMap.get(this)
	console.log('[connection] routing %s to %s:%d', (state.remote = state.socket.remoteAddress + ':' + state.socket.remotePort), this.remoteAddress, this.remotePort)
}

function onServerClose() {
	console.log('[connection] %s disconnected', stateMap.get(this).remote)
	console.log('[proxy] unloading user modules')
	clearUserModules()
}

const { Connection, RealClient } = require('tera-proxy-game')
let connection

function createServ(socket) {
	socket.setNoDelay(true)

	connection = new Connection()
	const client = new RealClient(connection, socket)
	const target = stateMap.get(this)
	const srvConn = connection.connect(client, {
		host: target.ip,
		port: target.port
	})
	stateMap.set(srvConn, { remote: '???', socket })

	if (!Array.isArray(modules)) modules = populateModulesList()
	for (let i = 0, len = modules.length; i < len; ++i) connection.dispatch.load(modules[i], module)

	socket.on('error', console.warn)
	srvConn.on('connect', onServerConnect)
	srvConn.on('error', console.warn)
	srvConn.on('close', onServerClose)
}

const SlsProxy = require('tera-proxy-sls')
let servers, stateMap, proxy

function runSlsProxy() {
	servers = new Map()
	stateMap = new WeakMap()
	proxy = new SlsProxy(currentRegion)

	require('dns').setServers(['8.8.8.8', '8.8.4.4'])

	proxy.fetch((err, gameServers) => {
		if (err) throw err

		for (let i = 0, arr = Object.keys(currentRegion.customServers), len = arr.length; i < len; ++i) {
			const id = arr[i]
			const target = gameServers[id]
			if (!target) {
				console.error(`server ${id} not found`)
				continue
			}

			const server = require('net').createServer(createServ)
			stateMap.set(server, target)
			servers.set(id, server)
		}
		proxy.listen(currentRegion.listenHostname, listenHandler)
	})
}

function Exit() {
	console.log('terminating...')

	try { hosts.remove(currentRegion.listenHostname, currentRegion.hostname) }
	catch (_) { }

	proxy.close()
	for (let i = servers.values(), step; !(step = i.next()).done;) step.value.close()
}

function loadModule(name) {
	if (connection.dispatch.load(name, module) !== null) {
		return true
	}
	return false
}

function unloadModule(name) {
	if (connection.dispatch.unload(name)) {
		return true
	}
	return false
}

function reset() {
	connection.dispatch.reset()
}

module.exports = { Start, populateModulesList, Exit, loadModule, unloadModule, reset }