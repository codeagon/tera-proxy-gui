const fs = require('fs')
const path = require('path')
const { remote, ipcRenderer } = require('electron')

const modulepath = path.join(__dirname, '..', 'node_modules')

let debug = true
let config = null

try {
	config = require('../config.json')
} catch (e) {
	config = { "region": "EU", "autostart": false, "theme": "black" }
}

function setconfig() {
	if (debug) console.log(`set region to ${config.region}`)
	$(`option:contains(${config.region}):first`).prop('selected', true)
	if (config.autostart) {
		$('#autostart').prop('checked', true)
		startproxy()
	}
	$('head').append('<link rel="stylesheet" href="css/' + config.theme + '.css">')
}

function saveconfig() {
	fs.writeFileSync('bin/config.json', JSON.stringify(config, null, "\t"))
}

function startproxy() {
	config.region = $('#regions').find(":selected").text()
	saveconfig()
	$('#startproxy').text('Close Proxy')
	$('#title-status').text('Proxy is running (づ￣ ³￣)づ')
	ipcRenderer.send('run proxy', config.region)
}

function ModulesScanner() {
	if (debug) console.log('Loading modules...')
	modules = fs.readdirSync(modulepath)
	for (var m in modules) {
		// check char '_' for (en/dis)abled module
		modules[m].charAt(0) === '_' ? modules[m] = [modules[m].substr(1, modules[m].length), 'disable'] : modules[m] = [modules[m], 'enable']
		if (debug) console.log(`Found module ${modules[m][0]}: ${modules[m][1]}`)
	}
	return modules.sort()
}

function ShowModules() {
	let modules = ModulesScanner()
	// delete current modules list
	$('ul[class="ModulesList"]').empty()
	// generate modules list
	$('ul[class="ModulesList"]').append(
		modules.map(module =>
			$('<li>').append()
				.addClass('module ' + module[1]) // (en/dis)abled
				.text(module[0]) //module name
		)
	)
}

function DisableModule(name) {
	if (debug) console.log(`disable module ${name}`)
	fs.renameSync(`${modulepath}/${name}`, `${modulepath}/_${name}`)
}

function EnableModule(name) {
	if (debug) console.log(`enable module ${name}`)
	fs.renameSync(`${modulepath}/_${name}`, `${modulepath}/${name}`)
}

jQuery(($) => {

	/*
	 * Modules
	 */

	// Load modules list on start
	ShowModules()

	// (en/dis)able modules
	$('.ModulesList').on('click', 'li', function () {
		let name = $(this).text()
		if ($(this).hasClass('enable')) {
			DisableModule(name)
			$(this).removeClass('enable').addClass('disable')
		} else {
			EnableModule(name)
			$(this).removeClass('disable').addClass('enable')
		}
	})

	/*
	 * Tabs
	 */

	// Change tabs
	$('ul.tabs li').click(function () {
		let tabname = $(this).attr('tabname')
		if (debug) console.log('change tab:', tabname)
		$('ul.tabs li').removeClass('current')
		$('.tab-content').removeClass('current')
		$(this).addClass('current')
		$("#" + tabname).addClass('current')
		if (tabname === 'Modules') { ShowModules() }
	})

	/*
	 * Proxy
	 */

	// Start proxy
	$('#startproxy').click(function () {
		if ($(this).text() === 'Start Proxy') {
			startproxy()
		} else if ($(this).text() === 'Close Proxy') {
			$(this).text('Start Proxy')
			$('#title-status').text('Proxy not running ¯\\_(ツ)_/¯')
			ipcRenderer.send('close proxy')
		}
	})

	$('#autostart').click(function () {
		if ($(this).is(':checked')) {
			config.autostart = true
		} else {
			config.autostart = false
		}
	})

	/*
	 * Logs
	 */

	// clear log btn > clear log (rly? owo)
	$('#clear-logs').click(() => {
		$('#logsgoeshere').text('')
	})

	// ipc on proxy-log > add logs
	ipcRenderer.on('proxy-log', (event, data) => {
		if (debug) console.log('proxy-log', data.toString())
		let txt = $('#logsgoeshere').text()
		$('#logsgoeshere').text(txt += data.toString())
	})

	/*
	 * Other shit
	 */

	// config
	setconfig()

	// Close btn > minimize in tray
	$('#close-btn').click(() => {
		remote.getCurrentWindow().minimize()
	})

	// change theme
	$('div.theme').click(function () {
		let theme = $(this).attr('class').split(' ').pop()
		config.theme = theme
		saveconfig()
		$('head>link').filter('[rel="stylesheet"]:last').remove()
		$('head').append('<link rel="stylesheet" href="css/' + theme + '.css">')
	})

})