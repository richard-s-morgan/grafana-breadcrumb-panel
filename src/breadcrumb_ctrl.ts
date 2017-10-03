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
        // Add listener for route changes: If route has target-parameter then
        // tell parent window to navigate to given target
        // e.g. setting following url-link in some Grafana dashboard: ?target=/logs
        $scope.$on("$routeUpdate", () => {
            if ($location.search().target) {
                const messageObj = {
                    target: $location.search().target,
                    params: $location.search().params
                };
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
                return (_.findIndex(result, { uri: "db/" + filterItem }) > -1);
            })
            .map((item: string) => {
                return {
                    url: "dashboard/db/" + item,
                    name: _.find(result, { uri: "db/" + item }).title,
                    params: this.parseParamsString({ orgId })
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
            this.currentDashboard = window.location.pathname.split("/").pop();
            var uri = "db/" + this.currentDashboard;
            var obj: any = _.find(result, { uri: uri });
            // Add current dashboard to breadcrumb if it doesn't exist
            if (_.findIndex(this.dashboardList, { url: "dashboard/" + uri }) < 0 && obj) {
                this.dashboardList.push( { url: "dashboard/" + uri, name: obj.title, params: queryParams } );
            }
            // Update session storage
            sessionStorage.setItem("dashlist", JSON.stringify(this.dashboardList));
            this.notifyContainerWindow();
            // Parse modified breadcrumb and set it to url query params
            const parsedBreadcrumb = this.parseBreadcrumbForUrl();
            this.windowLocation.search({ breadcrumb: parsedBreadcrumb }).replace();
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
            // Assume that Grafana is is folder path 'grafana'
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
