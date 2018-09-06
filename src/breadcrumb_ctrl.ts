/**
 * <h3>Breadcrumb panel for Grafana</h3>
 *
 * Breadcrumb sends the dashboard's name, url and possible query params to the parent window on page load.
 * Pulssi uses Grafana inside iframe and Grafana shouldn't be used without Pulssi frame.
 * That's why breadcrumb panel checks if it is used inside iframe and if not then it navigates to Pulssi frame.
 * The breadcrumb panel also keeps Pulssi frame in sync with Grafana so that both know the dashboard
 * and Grafana's current url query params. The information is shared with window postmessage.
 * Pulssi breadcrumb also has a feature to navigate out of Grafana frame to some other Pulssi page e.g. Logs.
 * This is done by giving a target url query param in Grafana link e.g. ?relaytarget=logs
 */

/// <reference path="../typings/common.d.ts" />
/// <reference path="../typings/index.d.ts" />

import _ from "lodash";
import { PanelCtrl } from "app/plugins/sdk";
import { impressions } from "app/features/dashboard/impression_store";
import config from "app/core/config";
import "./breadcrumb.css!";

class BreadcrumbCtrl extends PanelCtrl {
    static templateUrl = "module.html";
    backendSrv: any;
    currentDashboard: string;
    windowLocation: ng.ILocationService;
    panel: any;
    allDashboards: any;

    /**
     * Breadcrumb class constructor
     * @param {ng.IScope} $scope Angular scope
     * @param {ng.auto.IInjectorService} $injector Angluar injector service
     * @param {ng.ILocationService} $location Angular location service
     * @param {any} backendSrv Grafana backend callback
     */
    constructor($scope: ng.IScope, $injector: ng.auto.IInjectorService, $location: ng.ILocationService,
      backendSrv: any, $rootScope: ng.IRootScopeService) {
        super($scope, $injector);
        this.panel.title = 'Breadcrumb Panel';
        // Init variables
        this.backendSrv = backendSrv;
        this.windowLocation = $location;
        this.updateText();
        // Check if Grafana is NOT inside Iframe and redirect to Pulssi frame such case
        if (!this.isInsideIframe()) {
            let url = "";
            if (window.location.hostname === "localhost") {
                // Using local version of Grafana for testing purposes
                url = "http://localhost:8080/";
            } else {
                // Assume that Pulssi frontend is in the domain root of Grafana url
                url = window.location.protocol + "//" + window.location.hostname + "/";
            }
            var path = window.location.pathname.split("/");
            this.currentDashboard = path.pop();
            url += "?dashboard=" + path.pop();
            const queryParams = window.location.search;
            if (queryParams.indexOf("?") > -1) {
              url += "&" + queryParams.substr(1, queryParams.length)
            }
            window.location.href = url;
        }
        // Adding a mechanism for telling parent frame to navigate to new url
        // Add listener for route changes: If route has relaytarget-parameter then
        // tell parent window to navigate to given target
        // e.g. setting following url-link in some Grafana dashboard: ?relaytarget=logs
        // relayparams-parameter sets the path and possible query-params which are given to iFrame under parent
        // e.g. relaytarget=logs&relayparams=search%3Foption%3Dtest
        $rootScope.$on("$routeUpdate", () => {
            if ($location.search().relaytarget) {
                const messageObj = {
                    relaytarget: $location.search().relaytarget,
                    relayparams: $location.search().relayparams
                };
                // Add possible url params as their own keys to messageObj
                if (messageObj.relayparams && messageObj.relayparams.indexOf("?") > -1) {
                    const queryString = messageObj.relayparams.split("?")[1];
                    const queryObj = {};
                    queryString.split("&").map(item => queryObj[item.split("=")[0]] = item.split("=")[1]);
                    Object.keys(queryObj).map(param => {
                        messageObj[param] = queryObj[param];
                    });
                    messageObj.relayparams = messageObj.relayparams.split("?")[0];
                }
                // Send messageObj to parent window
                window.top.postMessage(messageObj, "*");
            }
        });
    }

    /**
     * Update Breadcrumb items
     */
    updateText() {
        // Fetch list of all dashboards from Grafana
        this.backendSrv.search().then((result: any) => {
            this.allDashboards = result;
            // Set current dashboard
            var path = window.location.pathname.split("/");
            this.currentDashboard = path.pop();
            const dbSource = "/d/" + path.pop();
            const uri = `${dbSource}`;
            var obj: any = _.find(result, (dbItem) => dbItem.url.indexOf(`${uri}`) > -1);
            this.notifyContainerWindow({ url: uri, name: obj.title, uid: obj.uid });
        });
    }

    /**
     * Notify container window
     */
    notifyContainerWindow(messageObj: any) {
        // Get Grafana query params
        let grafanaQueryParams = "";
        let orgId = "";
        Object.keys(this.windowLocation.search()).map((param) => {
            if (param !== "breadcrumb" && param !== "dashboard" && param !== "orgId" && param !== "random"
                && this.windowLocation.search()[param] && this.windowLocation.search()[param] !== "null") {
                grafanaQueryParams += "&" + param + "=" + this.windowLocation.search()[param];
            } if (param === "orgId") {
                orgId = this.windowLocation.search()[param];
            }
        });
        messageObj.breadcrumb = true;
        messageObj.params = grafanaQueryParams;
        messageObj.orgId = orgId;
        window.top.postMessage(messageObj, "*");
    }

    /**
     * Check if Grafana window is inside Iframe
     * @returns {boolean}
     */
    isInsideIframe() {
        try {
            return window.self !== window.top;
        } catch (error) {
            return true;
        }
    }

}

export { BreadcrumbCtrl, BreadcrumbCtrl as PanelCtrl }
