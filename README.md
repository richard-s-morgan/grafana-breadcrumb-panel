# Breadcrumb Panel Plugin for Grafana
This is a panel plugin for [Grafana](http://grafana.org/). It sends dashboard data to parent frame when page is loaded.
This way parent frame can keep track of visited dashboards and display them as a breadcrumb. The breadcrumb was previously shown in this Grafana panel but is now moved to Pulssi frontend.
Note that this plugin can track only dashboards that have breadcrumb panel on them.

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
Pulssi uses Grafana inside iFrame. When breadcrumb panel is loaded it checks if the Grafana window is inside iFrame and if not it is redirected to Pulssi's Grafana page. Also when dashboard is loaded it sends the updated information to Pulssi frame.

### Navigating out of iFrame
Sending links from Grafana window to parent window can be achieved by creating a Grafana dashboard link to current dashboard and setting query to contain relaytarget and relayparams parameters.
e.g. Set query to
```
relaytarget=logs&relayparams=streams
```
So e.g. if parent domain is ``https://demo.pulssi.digia.com`` this will tell parent window to navigate to
```
https://demo.pulssi.digia.com/logs?relayparams=streams
```
You can also send optional params inside relayparams and they will be added to query but they must be url-encoded.
E.g. if you send following link from Grafana:
```
relaytarget=logs&relayparams=streams%2F%3Fstarttime%3D123%26term%3Dtest
```
It will call parent window with following URL:
```
https://demo.pulssi.digia.com/logs?relayparams=streams&starttime=123&term=test
```
