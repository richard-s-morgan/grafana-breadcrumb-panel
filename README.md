# grafana-breadcrumb-panel
This is a panel plugin for [Grafana](http://grafana.org/). It keeps track of dashboards you have visited within one session
and displays them as a breadcrumb. Each dashboard is added only once to the breadcrumb. You can navigate back to some
dashboard in breadcrumb by clicking the dashboard name link text. All items coming after the selected dashboard will be removed from the breadcrumb.

To understand what this is all about, read the [Grafana's documentation about plugins](http://docs.grafana.org/plugins/development/).

## Features
* [Angular.js (1.0)](https://angularjs.org/)
* [Typescript](https://www.typescriptlang.org/)
* [Pug](https://pugjs.org/api/getting-started.html)
* [Sass](http://sass-lang.com/)

## Compiling
```
npm install
grunt
```
The compiled product is in ``dist`` folder.

## Deployment
Copy the contents of ``dist`` folder to ``grafana/data/plugins/breadcrumb`` folder so Grafana will find the plugin and it can be used in Grafana dashboards.
