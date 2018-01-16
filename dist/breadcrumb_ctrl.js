"use strict";

System.register(["lodash", "app/plugins/sdk", "app/features/dashboard/impression_store", "./breadcrumb.css!"], function (_export, _context) {
    "use strict";

    var _, PanelCtrl, impressions, _createClass, BreadcrumbCtrl;

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    function _possibleConstructorReturn(self, call) {
        if (!self) {
            throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
        }

        return call && (typeof call === "object" || typeof call === "function") ? call : self;
    }

    function _inherits(subClass, superClass) {
        if (typeof superClass !== "function" && superClass !== null) {
            throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
        }

        subClass.prototype = Object.create(superClass && superClass.prototype, {
            constructor: {
                value: subClass,
                enumerable: false,
                writable: true,
                configurable: true
            }
        });
        if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
    }

    return {
        setters: [function (_lodash) {
            _ = _lodash.default;
        }, function (_appPluginsSdk) {
            PanelCtrl = _appPluginsSdk.PanelCtrl;
        }, function (_appFeaturesDashboardImpression_store) {
            impressions = _appFeaturesDashboardImpression_store.impressions;
        }, function (_breadcrumbCss) {}],
        execute: function () {
            _createClass = function () {
                function defineProperties(target, props) {
                    for (var i = 0; i < props.length; i++) {
                        var descriptor = props[i];
                        descriptor.enumerable = descriptor.enumerable || false;
                        descriptor.configurable = true;
                        if ("value" in descriptor) descriptor.writable = true;
                        Object.defineProperty(target, descriptor.key, descriptor);
                    }
                }

                return function (Constructor, protoProps, staticProps) {
                    if (protoProps) defineProperties(Constructor.prototype, protoProps);
                    if (staticProps) defineProperties(Constructor, staticProps);
                    return Constructor;
                };
            }();

            _export("PanelCtrl", _export("BreadcrumbCtrl", BreadcrumbCtrl = function (_PanelCtrl) {
                _inherits(BreadcrumbCtrl, _PanelCtrl);

                /**
                 * Breadcrumb class constructor
                 * @param {IBreadcrumbScope} $scope Angular scope
                 * @param {ng.auto.IInjectorService} $injector Angluar injector service
                 * @param {ng.ILocationService} $location Angular location service
                 * @param {any} backendSrv Grafana backend callback
                 */
                function BreadcrumbCtrl($scope, $injector, $location, backendSrv) {
                    _classCallCheck(this, BreadcrumbCtrl);

                    var _this = _possibleConstructorReturn(this, (BreadcrumbCtrl.__proto__ || Object.getPrototypeOf(BreadcrumbCtrl)).call(this, $scope, $injector));

                    // Init variables
                    $scope.navigate = _this.navigate.bind(_this);
                    _this.backendSrv = backendSrv;
                    _this.dashboardList = [];
                    _this.windowLocation = $location;
                    // Check for browser session storage and create one if it doesn't exist
                    if (!sessionStorage.getItem("dashlist")) {
                        sessionStorage.setItem("dashlist", "[]");
                    }
                    // Check if URL params has breadcrumb
                    if ($location.search().breadcrumb) {
                        var items = $location.search().breadcrumb.split(",");
                        _this.createDashboardList(items);
                    } else {
                        // If no URL params are given then get dashboard list from session storage
                        _this.dashboardList = JSON.parse(sessionStorage.getItem("dashlist"));
                    }
                    _this.updateText();
                    // Listen for PopState events so we know when user navigates back with browser
                    // On back navigation we'll take the changed breadcrumb param from url query and
                    // recreate dashboard list
                    window.onpopstate = function (event) {
                        if (_this.dashboardList.length > 0) {
                            if ($location.search().breadcrumb) {
                                var _items = $location.search().breadcrumb.split(",");
                                _this.createDashboardList(_items);
                            }
                        }
                    };
                    return _this;
                }
                /**
                 * Create dashboard items
                 * @param {string[]} items Array of dashboard ids
                 */


                _createClass(BreadcrumbCtrl, [{
                    key: "createDashboardList",
                    value: function createDashboardList(items) {
                        var _this2 = this;

                        var dashIds = impressions.getDashboardOpened();
                        var orgId = this.windowLocation.search()["orgId"];
                        // Fetch list of all dashboards from Grafana
                        this.backendSrv.search({ dashboardIds: dashIds, limit: this.panel.limit }).then(function (result) {
                            _this2.dashboardList = items.filter(function (filterItem) {
                                var isInDatabase = _.findIndex(result, { uri: "db/" + filterItem }) > -1;
                                var isInFile = _.findIndex(result, { uri: "file/" + filterItem }) > -1;
                                return isInDatabase || isInFile;
                            }).map(function (item) {
                                var dbSource = _.findIndex(result, { uri: "file/" + item }) > -1 ? "file" : "db";
                                return {
                                    url: "dashboard/" + dbSource + "/" + item,
                                    name: _.find(result, { uri: dbSource + "/" + item }).title,
                                    params: _this2.parseParamsString({ orgId: orgId })
                                };
                            });
                            // Update session storage
                            sessionStorage.setItem("dashlist", JSON.stringify(_this2.dashboardList));
                        });
                    }
                }, {
                    key: "parseBreadcrumbForUrl",
                    value: function parseBreadcrumbForUrl() {
                        var _this3 = this;

                        var parsedBreadcrumb = "";
                        this.dashboardList.map(function (item, index) {
                            parsedBreadcrumb += item.url.split("/").pop();
                            if (index < _this3.dashboardList.length - 1) {
                                parsedBreadcrumb += ",";
                            }
                        });
                        return parsedBreadcrumb;
                    }
                }, {
                    key: "updateText",
                    value: function updateText() {
                        var _this4 = this;

                        var dashIds = impressions.getDashboardOpened();
                        var queryParams = window.location.search;
                        // Fetch list of all dashboards from Grafana
                        this.backendSrv.search({ dashboardIds: dashIds, limit: this.panel.limit }).then(function (result) {
                            // Set current dashboard
                            _this4.currentDashboard = window.location.pathname.split("/").pop();
                            var dbSource = window.location.pathname.indexOf("/file/") > -1 ? "file" : "db";
                            var uri = dbSource + "/" + _this4.currentDashboard;
                            var obj = _.find(result, { uri: uri });
                            // Add current dashboard to breadcrumb if it doesn't exist
                            if (_.findIndex(_this4.dashboardList, { url: "dashboard/" + uri }) < 0 && obj) {
                                _this4.dashboardList.push({ url: "dashboard/" + uri, name: obj.title, params: queryParams });
                            }
                            // Update session storage
                            sessionStorage.setItem("dashlist", JSON.stringify(_this4.dashboardList));
                            // Parse modified breadcrumb and set it to url query params
                            var parsedBreadcrumb = _this4.parseBreadcrumbForUrl();
                            _this4.windowLocation.search({ breadcrumb: parsedBreadcrumb }).replace();
                        });
                    }
                }, {
                    key: "parseParamsObject",
                    value: function parseParamsObject(params) {
                        var paramsObj = {};
                        if (params.charAt(0) === "?") {
                            params = params.substr(1, params.length);
                        }
                        var paramsArray = params.split("&");
                        paramsArray.map(function (paramItem) {
                            var paramItemArr = paramItem.split("=");
                            paramsObj[paramItemArr[0]] = paramItemArr[1];
                        });
                        return paramsObj;
                    }
                }, {
                    key: "parseParamsString",
                    value: function parseParamsString(params) {
                        var paramsString = "?";
                        Object.keys(params).map(function (paramKey, index) {
                            paramsString += paramKey + "=" + params[paramKey];
                            if (index < Object.keys(params).length - 1) {
                                paramsString += "&";
                            }
                        });
                        return paramsString;
                    }
                }, {
                    key: "navigate",
                    value: function navigate(url, params) {
                        // Check if user is navigating backwards in breadcrumb and
                        // remove all items that follow the selected item in that case
                        var index = _.findIndex(this.dashboardList, { url: url });
                        if (index > -1 && this.dashboardList.length >= index + 2) {
                            this.dashboardList.splice(index + 1, this.dashboardList.length - index - 1);
                            sessionStorage.setItem("dashlist", JSON.stringify(this.dashboardList));
                        }
                        // Parse params string to object
                        var queryParams = this.parseParamsObject(params);
                        // Delete possible breadcrumb param so that breadcrumb from session will be used instead
                        delete queryParams["breadcrumb"];
                        // Check url root assuming that Grafana dashboard url has string "dashboard/db/"
                        var urlRoot = window.location.href.substr(0, window.location.href.indexOf("dashboard/db/"));
                        // Set new url and notify parent window
                        window.location.href = urlRoot + url + this.parseParamsString(queryParams);
                    }
                }]);

                return BreadcrumbCtrl;
            }(PanelCtrl)));

            BreadcrumbCtrl.templateUrl = "module.html";

            _export("BreadcrumbCtrl", BreadcrumbCtrl);

            _export("PanelCtrl", BreadcrumbCtrl);
        }
    };
});
//# sourceMappingURL=breadcrumb_ctrl.js.map
