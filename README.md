# Breadcrumb Panel Plugin for Grafana
This is a panel plugin for [Grafana](http://grafana.org/). It keeps track of dashboards you have visited within one session
and displays them as a breadcrumb. Each dashboard is added only once to the breadcrumb. You can navigate back to some
dashboard in breadcrumb by clicking the dashboard name link text. When navigation back all items coming after the selected
dashboard will be removed from the breadcrumb. Note that breadcrumb can track only dashboards that have breadcrumb panel on them.

To understand what is a plugin, read the [Grafana's documentation about plugins](http://docs.grafana.org/plugins/development/).

### Features
* [Angular.js (1.0)](https://angularjs.org/)
* [Typescript](https://www.typescriptlang.org/)
* [Pug](https://pugjs.org/api/getting-started.html)
* [Sass](http://sass-lang.com/)

### Compiling
```
npm install
grunt
```
The compiled product is in ``dist`` folder.

### Deployment
Copy the contents of ``dist`` folder to ``plugins/breadcrumb`` folder so Grafana will find the plugin and it can be used in Grafana dashboards.

### Always inside iFrame
Pulssi uses Grafana inside iFrame. When breadcrumb panel is loaded it checks if the Grafana window is inside iFrame and if not it is redirected to Pulssi's Grafana page. Also when dashboard is loaded and added to breadcrumb in session storage then this panel sends the updated information to Pulssi frame.

### Navigating out of iFrame
Sending links from Grafana window to parent window can be achieved by creating a Grafana dashboard link to current dashboard and setting query to contain target and params.
e.g. Set query to
```
target=logs&params=streams
```
So e.g. if parent domain is ``https://demo.pulssi.digia.com`` this will tell parent window to navigate to
```
https://demo.pulssi.digia.com/logs?params=streams
```
