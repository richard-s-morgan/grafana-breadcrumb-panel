/**
 * <h3>Breadcrumb panel for Grafana</h3>
 *
 * This breadcumb panel utilizes session storage to store dashboards where user has visited.
 * When panel is loaded it first checks if breadcrumb is given in url params and utilizes that.
 * If no breadcrumb is given in url params then panel tries to read breadcrumb from session storage.
 * Finally the panel adds the just loaded dashboard as the latest item in dashboard and updates session storage.
 * Breadcrumb stores the dashboard's name, url and possible query params to the session storage.
 * If user navigates with browser back button then breadcrumb is recreated from previous url params.
 * Also if user navigates back by clicking one of the breadcrumb items then the items following the selected
 * item are removed from breadcrumb, user is moved to selected dashboard and session storage is updated.
 *
 * Pulssi specific features:
 * Pulssi uses Grafana inside iframe and Grafana shouldn't be used without Pulssi frame.
 * That's why breadcrumb panel checks if it is used inside iframe and if not then it navigates to Pulssi frame.
 * The breadcrumb panel also keeps Pulssi frame in sync with Grafana so that both know the dashboard, breadcrumb
 * and Grafana's current url query params. The information is shared with window postmessage.
 * Pulssi breadcrumb also has a feature to navigate out of Grafana frame to some other Pulssi page e.g. Logs.
 * This is done by giving a target url query param in Grafana link e.g. ?target=logs
 */

/// <reference path="../typings/common.d.ts" />
/// <reference path="../typings/index.d.ts" />

import _ from "lodash";
import { PanelCtrl } from "app/plugins/sdk";
import { impressions } from "app/features/dashboard/impression_store";
import config from "app/core/config";
import "./breadcrumb.css!";

export interface IBreadcrumbScope extends ng.IScope {
    navigate: (url: string) => void;
}

export interface dashboardListItem {
    url: string;
    name: string;
    params: string;
    uid: string;
}

class BreadcrumbCtrl extends PanelCtrl {
    static templateUrl = "module.html";
    backendSrv: any;
    dashboardList: dashboardListItem[];
    currentDashboard: string;
    windowLocation: ng.ILocationService;
    panel: any;

    /**
     * Breadcrumb class constructor
     * @param {IBreadcrumbScope} $scope Angular scope
     * @param {ng.auto.IInjectorService} $injector Angluar injector service
     * @param {ng.ILocationService} $location Angular location service
     * @param {any} backendSrv Grafana backend callback
     */
    constructor($scope: IBreadcrumbScope, $injector: ng.auto.IInjectorService, $location: ng.ILocationService, backendSrv: any) {
        super($scope, $injector);
        // Init variables
        $scope.navigate = this.navigate.bind(this);
        this.backendSrv = backendSrv;
        this.dashboardList = [];
        this.windowLocation = $location;
        // Check for browser session storage and create one if it doesn't exist
        if (!sessionStorage.getItem("dashlist")) {
            sessionStorage.setItem("dashlist", "[]");
        }
        // Check if URL params has breadcrumb
        if ($location.search().breadcrumb) {
            const items = $location.search().breadcrumb.split(",");
            this.createDashboardList(items);
        } else {
            // If no URL params are given then get dashboard list from session storage
            this.dashboardList = JSON.parse(sessionStorage.getItem("dashlist"));
        }
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
            url += "?dashboard=" + window.location.pathname.split("/").pop();
            url += "&breadcrumb=" + this.parseBreadcrumbForUrl()
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
        $scope.$on("$routeUpdate", () => {
            if ($location.search().relaytarget) {
                const messageObj = {
                    relaytarget: $location.search().relaytarget,
                    relayparams: $location.search().relayparams
                };
                // Add possible url params as their own keys to messageObj
                if (messageObj.relayparams.indexOf("?") > -1) {
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
        // Listen for PopState events so we know when user navigates back with browser
        // On back navigation we'll take the changed breadcrumb param from url query and
        // recreate dashboard list and notify parent window
        window.onpopstate = (event: Event) => {
            if (this.dashboardList.length > 0) {
                if ($location.search().breadcrumb) {
                    const items = $location.search().breadcrumb.split(",");
                    this.createDashboardList(items);
                }
                this.notifyContainerWindow();
            }
        }
    }

    /**
     * Create dashboard items
     * @param {string[]} items Array of dashboard ids
     */
    createDashboardList(items: string[]) {
        var dashIds = impressions.getDashboardOpened();
        var orgId = this.windowLocation.search()["orgId"];
        // Fetch list of all dashboards from Grafana
        this.backendSrv.search({dashboardIds: dashIds, limit: this.panel.limit}).then((result: any) => {
            this.dashboardList = items.filter((filterItem: string) => {
                const isInDatabase = _.findIndex(result, { uri: "db/" + filterItem }) > -1;
                const isInFile = _.findIndex(result, { uri: "file/" + filterItem }) > -1;
                return (isInDatabase || isInFile);
            })
            .map((item: string) => {
                const dbSource = _.findIndex(result, { uri: "file/" + item }) > -1 ? "file" : "db";
                const uid = _.find(result, { uri: `${dbSource}/${item}` }).uid;
                return {
                    url: `d/${uid}/${item}`,
                    name: _.find(result, { uri: `${dbSource}/${item}` }).title,
                    params: this.parseParamsString({ orgId }),
                    uid
                }
            });
            // Update session storage
            sessionStorage.setItem("dashlist", JSON.stringify(this.dashboardList));
        });
    }

    /**
     * Parse breadcrumb string for URL
     * @returns {string}
     */
    parseBreadcrumbForUrl() {
        let parsedBreadcrumb = "";
        this.dashboardList.map((item, index) => {
            parsedBreadcrumb += item.url.split("/").pop();
            if (index < this.dashboardList.length - 1) {
                parsedBreadcrumb += ",";
            }
        });
        return parsedBreadcrumb;
    }

    /**
     * Update Breadcrumb items
     */
    updateText() {
        var dashIds = impressions.getDashboardOpened();
        var queryParams = window.location.search;
        // Fetch list of all dashboards from Grafana
        this.backendSrv.search({dashboardIds: dashIds, limit: this.panel.limit}).then((result: any) => {
            // Set current dashboard
            var path = window.location.pathname.split("/");
            this.currentDashboard = path.pop();
            const dbSource = "d/" + path.pop();
            const uri = `${dbSource}/${this.currentDashboard}`;
            var obj: any = _.find(result, { url: uri });
            // Add current dashboard to breadcrumb if it doesn't exist
            if (_.findIndex(this.dashboardList, { url: uri }) < 0 && obj) {
                this.dashboardList.push( { url: uri, name: obj.title, params: queryParams, uid: obj.uid } );
            }
            // Update session storage
            sessionStorage.setItem("dashlist", JSON.stringify(this.dashboardList));
            this.notifyContainerWindow();
            // Parse modified breadcrumb and set it to url query params
            const parsedBreadcrumb = this.parseBreadcrumbForUrl();
            this.windowLocation.search("breadcrumb", parsedBreadcrumb).replace();
        });
    }

    /**
     * Notify container window
     */
    notifyContainerWindow() {
        // Get Grafana query params
        let grafanaQueryParams = "";
        Object.keys(this.windowLocation.search()).map((param) => {
            if (param !== "breadcrumb" && param !== "dashboard" && param !== "orgId" && param !== "random"
                && this.windowLocation.search()[param]) {
                grafanaQueryParams += "&" + param + "=" + this.windowLocation.search()[param];
            }
        });
        // Check organisation id
        this.backendSrv.get("api/org").then((result: any) => {
            const orgId = String(result.id);
            const messageObj = {
                dashboard: window.location.pathname.split("/").pop(),
                breadcrumb: this.dashboardList,
                orgId,
                grafanaQueryParams
            }
            // Send message to upper window
            window.top.postMessage(messageObj, "*");
        });
    }

    /**
     * Parse params string to object
     * @param {string} params
     * @returns {Object}
     */
    parseParamsObject(params: string) {
        const paramsObj = {};
        if (params.charAt(0) === "?") {
            params = params.substr(1, params.length);
        }
        const paramsArray = params.split("&");
        paramsArray.map((paramItem) => {
            const paramItemArr = paramItem.split("=");
            paramsObj[paramItemArr[0]] = paramItemArr[1];
        });
        return paramsObj;
    }

    /**
     * Parse params object to string
     * @param {Object} params
     * @returns {string}
     */
    parseParamsString(params: Object) {
        let paramsString = "?";
        Object.keys(params).map((paramKey, index) => {
            paramsString += paramKey + "=" + params[paramKey];
            if (index < Object.keys(params).length - 1) {
                paramsString += "&";
            }
        });
        return paramsString;
    }

    /**
     * Navigate to given dashboard
     * @param {string} url
     */
    navigate(url: string, params: string) {
        // Check if user is navigating backwards in breadcrumb and
        // remove all items that follow the selected item in that case
        const index = _.findIndex(this.dashboardList, { url: url });
        if (index > -1 && this.dashboardList.length >= index + 2) {
            this.dashboardList.splice(index + 1, this.dashboardList.length - index - 1);
            sessionStorage.setItem("dashlist", JSON.stringify(this.dashboardList));
        }
        // Parse params string to object
        const queryParams = this.parseParamsObject(params);
        // Delete possible breadcrumb param so that breadcrumb from session will be used instead
        delete queryParams["breadcrumb"];
        let urlRoot = "";
        if (window.location.hostname === "localhost") {
            // Using local version of Grafana for testing purposes
            urlRoot = "http://localhost:3000/";
        } else {
            // Assume that Grafana is in folder path 'grafana'
            urlRoot = window.location.protocol + "//" + window.location.hostname + "/grafana/";
        }
        // Set new url and notify parent window
        window.location.href = urlRoot + url + this.parseParamsString(queryParams);
        this.notifyContainerWindow();
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
