const { remote, ipcRenderer } = require('electron')

let debug = true,
	config = remote.getGlobal('config')

function StyleThisShit() {
	$(':root').css('--AccentColor', '#' + remote.systemPreferences.getAccentColor().substr(0, 6))
	remote.systemPreferences.on('accent-color-changed', (event, color) => {
		$(':root').css('--AccentColor', '#' + color.substr(0, 6))
	})
}

function ShowModules(modules) {
	$('ul[class="Modules"]').empty()
	$('ul[class="Modules"]').append(
		modules.map(module =>
			$('<li>').append()
				.addClass('module ' + module[1])
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

	// hello boi im ready to inject
	ipcRenderer.send('loaded')

})