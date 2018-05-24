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
 * This is done by giving a target url query param in Grafana link e.g. ?relaytarget=logs
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

const panelDefaults = {
    isRootDashboard: false
};

class BreadcrumbCtrl extends PanelCtrl {
    static templateUrl = "module.html";
    backendSrv: any;
    dashboardList: dashboardListItem[];
    currentDashboard: string;
    windowLocation: ng.ILocationService;
    panel: any;
    allDashboards: any;

    /**
     * Breadcrumb class constructor
     * @param {IBreadcrumbScope} $scope Angular scope
     * @param {ng.auto.IInjectorService} $injector Angluar injector service
     * @param {ng.ILocationService} $location Angular location service
     * @param {any} backendSrv Grafana backend callback
     */
    constructor($scope: IBreadcrumbScope, $injector: ng.auto.IInjectorService, $location: ng.ILocationService, backendSrv: any) {
        super($scope, $injector);
        panelDefaults.isRootDashboard = false;
        this.panel.title = 'Breadcrumb Panel';
        _.defaults(this.panel, panelDefaults);
        this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
        // Init variables
        $scope.navigate = this.navigate.bind(this);
        this.backendSrv = backendSrv;
        this.dashboardList = [];
        this.windowLocation = $location;
        // Check for browser session storage and create one if it doesn't exist
        if (!sessionStorage.getItem("dashlist") || this.panel.isRootDashboard) {
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
            var path = window.location.pathname.split("/");
            this.currentDashboard = path.pop();
            url += "?dashboard=" + path.pop();
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
                if ($location.state().breadcrumb) {
                    const items = $location.state().breadcrumb.split(",");
                    this.createDashboardList(items);
                }
                this.notifyContainerWindow();
            }
        }
    }

    /**
     * Callback for showing panel editor template
     */
    onInitEditMode() {
        this.addEditorTab('Options', 'public/plugins/breadcrumb/editor.html', 2);
    }

    /**
     * Create dashboard items
     * @param {string[]} items Array of dashboard ids
     */
    createDashboardList(items: string[]) {
        if (this.allDashboards) {
            // Dashboard data has been loaeded from Grafana
            this.filterDashboardList(items, this.allDashboards);
        } else {
            // Fetch list of all dashboards from Grafana
            this.backendSrv.search().then((result: any) => {
                this.filterDashboardList(items, result);
            });
        }
    }

    /**
     * Filter dashboard list
     * @param {string[]} DBlist Array of dashboards ids to be displayed
     * @param {any} allDBs All dashboards fetched from Grafana API
     */
    filterDashboardList(DBlist: string[], allDBs: any) {
        var orgId = this.windowLocation.search()["orgId"];
        this.dashboardList = DBlist.filter((filterItem: string) => {
            const isInDatabase = _.findIndex(allDBs, (dbItem) => dbItem.url.indexOf(`/d/${filterItem}`) > -1) > -1;
            return (isInDatabase);
        })
        .map((item: string) => {
            const uid = _.find(allDBs, (dbItem) => dbItem.url.indexOf(`/d/${item}`) > -1).uid;
            return {
                url: `/d/${uid}`,
                name: _.find(allDBs, (dbItem) => dbItem.url.indexOf(`/d/${item}`) > -1).title,
                params: this.parseParamsString({ orgId }),
                uid
            }
        });
        // Update session storage
        sessionStorage.setItem("dashlist", JSON.stringify(this.dashboardList));
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
        // Get Grafana query params
        let grafanaQueryParams = "";
        Object.keys(this.windowLocation.search()).map((param) => {
            if (this.windowLocation.search()[param] && this.windowLocation.search()[param] !== "null") {
                grafanaQueryParams += "&" + param + "=" + this.windowLocation.search()[param];
            }
        });
        // Fetch list of all dashboards from Grafana
        this.backendSrv.search().then((result: any) => {
            this.allDashboards = result;
            // Set current dashboard
            var path = window.location.pathname.split("/");
            this.currentDashboard = path.pop();
            const dbSource = "/d/" + path.pop();
            const uri = `${dbSource}`;
            var obj: any = _.find(result, (dbItem) => dbItem.url.indexOf(`${uri}`) > -1);
            // Add current dashboard to breadcrumb if it doesn't exist
            if (_.findIndex(this.dashboardList, (dbItem) => dbItem.url.indexOf(`${uri}`) > -1) < 0 && obj) {
                this.dashboardList.push( { url: uri, name: obj.title, params: grafanaQueryParams, uid: obj.uid } );
            }
            // Update session storage
            sessionStorage.setItem("dashlist", JSON.stringify(this.dashboardList));
            this.notifyContainerWindow();
            // Parse modified breadcrumb and set it to url query params
            const parsedBreadcrumb = this.parseBreadcrumbForUrl();
            const queryObject = this.parseParamsObject(grafanaQueryParams);
            queryObject["breadcrumb"] = parsedBreadcrumb;
            this.windowLocation.state(queryObject).replace();
            history.replaceState(queryObject, "");
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
                && this.windowLocation.search()[param] && this.windowLocation.search()[param] !== "null") {
                grafanaQueryParams += "&" + param + "=" + this.windowLocation.search()[param];
            }
        });
        // Check organisation id
        this.backendSrv.get("api/org").then((result: any) => {
            const orgId = String(result.id);
            var path = window.location.pathname.split("/");
            this.currentDashboard = path.pop();
            const messageObj = {
                dashboard: path.pop(),
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
        if (params.charAt(0) === "?" || params.charAt(0) === "&") {
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
        const index = _.findIndex(this.dashboardList, (dbItem) => dbItem.url.indexOf(`${url}`) > -1);
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
            urlRoot = "http://localhost:3000";
        } else {
            // Assume that Grafana is in folder path 'grafana'
            urlRoot = window.location.protocol + "//" + window.location.hostname + "/grafana";
        }
        if (url.charAt(0) != "/") {
            urlRoot += "/";
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
