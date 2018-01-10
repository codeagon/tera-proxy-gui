const { remote, ipcRenderer } = require('electron')

let debug = remote.getGlobal('debug'),
	config = remote.getGlobal('config')

if (debug)
	require('devtron').install()

function StyleThisShit() {
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
	StyleThisShit()

	// update modules list
	ipcRenderer.on('modules', (event, modules) => {
		ShowModules(modules)
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

	// hello boi im ready to inject
	ipcRenderer.send('loaded')

})