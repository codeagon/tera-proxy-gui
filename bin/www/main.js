const { remote, ipcRenderer } = require('electron')

let debug = remote.getGlobal('debug'),
	config = remote.getGlobal('config')

if (debug)
	require('devtron').install()

function WinLoaded() {
	$(`option:contains(${config.region}):first`).prop('selected', true)
	if (config.autostart) $('#autostart').prop('checked', true)
	$(':root').css('--AccentColor', '#' + remote.systemPreferences.getAccentColor().substr(0, 6))
	remote.systemPreferences.on('accent-color-changed', (event, color) => {
		$(':root').css('--AccentColor', '#' + color.substr(0, 6))
	})
}

function ShowModules(modules) {
	$('#modules>ul').empty().append(
		modules.map(module =>
			$('<li>').append()
				.addClass(`module ${module[1] ? 'en' : 'dis'}able`)
				.text(module[0])
		)
	)
}

jQuery(($) => {

	// apply colors
	WinLoaded()

	// update modules list
	ipcRenderer.on('modules', (event, modules) => {
		ShowModules(modules)
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
	$('#autostart').click(function () {
		config.autostart = $(this).is(':checked') ? true : false
		ipcRenderer.send('config', config)
	})

	// state
	ipcRenderer.on('state', (event, s) => {
		$('#proxy>a').text(s)
	})

	// change theme
	$('#theme').click(function () {

	})

	// hello boi im ready to inject
	ipcRenderer.send('loaded')

})