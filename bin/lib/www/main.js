const { remote, ipcRenderer } = require('electron')

let debug = remote.getGlobal('debug'),
	config = remote.getGlobal('config')

if (debug) require('devtron').install()

function WinLoaded() {
	$(`option:contains(${config.region}):first`).prop('selected', true)
	// if (config.autostart) $('#autostart').prop('checked', true)
	$(':root').css('--AccentColor', '#' + remote.systemPreferences.getAccentColor().substr(0, 6))
}

function ShowModules(modules, LoadedModules) {
	$('#modules>ul').empty().append(
		modules.map(m =>
			$('<li>').append()
				.addClass(`module ${LoadedModules.includes(m) ? 'en' : 'dis'}able`)
				.text(m)
		)
	)
}

jQuery(($) => {

	// apply colors
	WinLoaded()

	// update modules list
	ipcRenderer.on('modules', (event, modules, LoadedModules) => {
		ShowModules(modules, LoadedModules)
	})

	// big btn in middle on this shit
	$('#proxy>a').click(function () {
		ipcRenderer.send('proxy')
	})

	// settings
	$('#settings').hide()
	$('#gear').click(function () {
		$('#settings').fadeToggle('fast')
	})

	// (en/dis)able modules
	$('#modules>ul').on('click', 'li', function () {
		ipcRenderer.send('toggle module', $(this).text())
	})

	// refresh modules
	$('#refresh').click(function () {
		ipcRenderer.send('refresh modules')
	})

	// autostart
	/* $('#autostart').click(function () {
		config.autostart = $(this).is(':checked') ? true : false
		ipcRenderer.send('config', config)
	}) */

	// state
	ipcRenderer.on('state', (event, s) => {
		$('#proxy>a').text(`${s ? 'Close' : 'Start'} Proxy`)
	})

	// change region
	$('select#regions').change(function () {
		console.log($(this).val())
		ipcRenderer.send('change region', $(this).val())
	})

	// hello boi im ready to inject
	ipcRenderer.send('loaded')

})