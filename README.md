## This branch is for dev/test/wip/shit/idkwtf
```
git clone https://github.com/Mathicha/tera-proxy-gui
cd tera-proxy-gui
npm i
```

(as admin) run TeraProxy.bat or npm start

## Dev, read this
For hot reload you need to add a destructor like this (if u use command)
```
this.destructor = () => {
	command.remove('youcommandname')
}
```