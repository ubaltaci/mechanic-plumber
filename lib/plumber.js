/**
 *
 * Created by uur on 25/06/14.
 */

var Fs = require("fs");
var Path = require("path");
var _ = require("lodash");
var Callsite = require("callsite");
var Clc = require("cli-color");

var Plugin;
var PluginPaths = {};

// Controller files key - require
var Controllers = {};

// Routes.js
var Routes = [];

// URL_PATH -> {method, path, config}
var HapiRoutes = {};

var resourcefulRoutes = {
    "index": {
        method: "GET",
        path: ""
    },
    "new": {
        method: "GET",
        path: "/new"
    },
    "edit": {
        method: "GET",
        path: "/{id}/edit"
    },
    "create": {
        method: "POST",
        path: "/create"
    },
    "update": {
        method: "POST",
        path: "/{id}/update"
    },
    "delete": {
        method: "POST",
        path: "/{id}/delete"
    },
    "sorting": {
        method: "GET",
        path: "/sorting"
    },
    "sorted": {
        method: "POST",
        path: "/sorted"
    }
};

function _pipe(plugin) {

    if (!plugin) {
        console.log(Clc.red.bold("Pipe first and only argument must be plugin itself"));
        process.exit(1);
    }

    if ( !global.mechanic.models ) {
        global.mechanic.models = {};
    }

    Plugin = plugin;
    PluginPaths = {};
    Controllers = {};
    Routes = [];
    HapiRoutes = {};

    var stack = Callsite();
    var requester = stack[1].getFileName();

    PluginPaths.mainPath = Path.dirname(requester);
    PluginPaths.mainFile = Path.basename(requester);

    _setPluginPaths();
    _setRoutes();

    if (PluginPaths.controllerDirectory) {
        _pipeControllers();
    }

    if (PluginPaths.modelDirectory) {
        _pipeModels();
    }
}

function _setRoutes() {
    Routes = require(PluginPaths.routeFile);
}

function _setPluginPaths() {
    // trim .js from filename
    var mainFileName = _trimExtFromFileName(PluginPaths.mainFile);
    // Set *_routes.js
    PluginPaths.routeFile = Path.join(PluginPaths.mainPath, mainFileName + "_routes.js");
    // Set *_policy.js
    PluginPaths.policyFile = Path.join(PluginPaths.mainPath, mainFileName + "_policy.js");

    // Set controller directory
    PluginPaths.controllerDirectory = Path.join(PluginPaths.mainPath, "controller");
    // Set model directory
    PluginPaths.modelDirectory = Path.join(PluginPaths.mainPath, "model");

    if (!Fs.existsSync(PluginPaths.controllerDirectory) || !Fs.statSync(PluginPaths.controllerDirectory).isDirectory()) {
        PluginPaths.controllerDirectory = null;
    }

    if (!Fs.existsSync(PluginPaths.modelDirectory) || !Fs.statSync(PluginPaths.modelDirectory).isDirectory()) {
        PluginPaths.modelDirectory = null;
    }
}

/**
 * Promise for returning all model files.
 * @return {Promise}
 */
function _pipeModels() {
    var modelFsItems = _readDirectoryRecursively(PluginPaths.modelDirectory, _filterModelFile)
    modelFsItems.forEach(function (modelFsItem) {
        global.mechanic.models[_getModelName(modelFsItem.name)] = require(modelFsItem.path);
    });
}

/**
 * Get model name from filename
 * @param fileName
 * @return {string} modelName
 */
function _getModelName(fileName) {
    var filename = _trimExtFromFileName(fileName).toLocaleLowerCase();
    return filename.charAt(0).toLocaleUpperCase() + filename.slice(1);
}

/**
 * Anything ends with *.js under "model" folder.
 * @param fsItem
 * @return {boolean}
 */
function _filterModelFile(fsItem) {
    return /(.*)\.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

/**
 * Pipe Controller files.
 */
function _pipeControllers() {

    // Recursively read controllerDirectory
    var fsItems = _readDirectoryRecursively(PluginPaths.controllerDirectory, _filterControllerFile);
    fsItems.forEach(function (fsItem) {
        Controllers[_trimExtFromFileName(fsItem.name)] = require(fsItem.path);
    });

    // 1. routes.js top presendence can not be overriden.
    _pipeRoutesJsIntoRoutes();

    // 2. _pipeControllersIntoRoutes();

    // 3. pipe HapiRoutes into Hapi! Yey!
    _pipeAllIntoHapi();
}

/**
 * Pipe routes defined in routes.js into HapiRoutes
 * @return {Object}
 */
function _pipeRoutesJsIntoRoutes() {

    var controllerName;
    var controllerAction;
    var relatedController;
    var relatedAction;

    Routes.forEach(function (route) {
        if (HapiRoutes[route.path] && HapiRoutes[route.path]["method"] === route.method) {
            throw new Error("URL path ( " + route.path + " | " + HapiRoutes[route.path]["method"] + " ) defined more than one in routes.js");
        }

        var config = route.config;
        if ((typeof config == "string" || config instanceof String) && config.indexOf("@") > 0) {
            // config just contain handler.
            controllerName = config.split("@")[0].trim();
            controllerAction = config.split("@")[1].trim();

            relatedController = Controllers[controllerName];
            if (!relatedController) {
                throw new Error("Controller : ( " + controllerName + ".js ) not found");
            }

            relatedAction = relatedController[controllerAction];
            if (!relatedAction) {
                throw new Error("Controller action -> " + controllerAction + " : ( " + controllerAction + "@" + controllerName + " ) defined in routes.js not found");
            }

            // Controller and Action found added!
            HapiRoutes[route.path + "@" + route.method] = {
                method: route.method,
                path: route.path || "GET",
                config: relatedAction
            };
        }
        else {
            controllerName = config.trim();
            relatedController = Controllers[controllerName];

            if (!relatedController) {
                throw new Error("Controller : ( " + controllerName + ".js ) not found defined in routes.js");
            }

            if (!relatedController.blueprint || !relatedController.blueprint.baseurl) {
                throw new Error("Controller : ( " + controllerName + ".js ) defined as a blueprint in routes.js but blueprint && baseurl not found in Controller file");
            }

            var baseurl = relatedController.blueprint.baseurl;
            Object.keys(resourcefulRoutes).forEach(function (resourcefulRoute) {
                var path = baseurl + resourcefulRoutes[resourcefulRoute].path;
                if (baseurl.indexOf("{id}") >= 0) {
                    path = baseurl + resourcefulRoutes[resourcefulRoute].path.replace("{id}", "{id1}");
                }
                else if (baseurl.indexOf("{id}") >= 0 && baseurl.indexOf("{id1}") >= 0) {
                    path = baseurl + resourcefulRoutes[resourcefulRoute].path.replace("{id}", "{id2}");
                }
                else {
                    path = baseurl + resourcefulRoutes[resourcefulRoute].path;
                }
                var method = resourcefulRoutes[resourcefulRoute].method;
                if (route.except && route.except.indexOf(resourcefulRoute) >= 0) {
                    ;//do nothing
                }
                else if (!relatedController[resourcefulRoute] && ((resourcefulRoute == "sorting") || (resourcefulRoute == "sorted"))) {
                    ;//do nothing
                }
                else if (!relatedController[resourcefulRoute]) {
                    console.log("Controller : ( " + controllerName + ".js ) defined as a blueprint in routes.js but " + resourcefulRoute + " not found in controller file");
                }
                else {
                    // Controller and Action found added!
                    HapiRoutes[path + "@" + method] = {
                        method: method,
                        path: path,
                        config: relatedController[resourcefulRoute]
                    };
                }
            });
        }
    });

    return HapiRoutes;
}

/**
 * *.js -> *
 * @param fileName
 * @return {string}
 */
function _trimExtFromFileName(fileName) {
    return fileName && fileName.split(".")[0];
}

/**
 * Anything ends with *Controller.js under "controller" folder.
 * @param fsItem
 * @return {boolean}
 */
function _filterControllerFile(fsItem) {
    return /(.*)\_controller.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

/**
 * Pipe all routes into plugin
 */
function _pipeAllIntoHapi() {

    var routeKeys = Object.keys(HapiRoutes);
    routeKeys.forEach(function (routeKey) {
        // Plug & Play with /
        if (!HapiRoutes[routeKey].path.endsWith("/")) {
            Plugin.route({
                path: HapiRoutes[routeKey].path + "/",
                method: HapiRoutes[routeKey].method,
                config: typeof HapiRoutes[routeKey].config !== 'function' ? HapiRoutes[routeKey].config : {
                    handler: HapiRoutes[routeKey].config
                }
            });
        }
        Plugin.route({
            path: HapiRoutes[routeKey].path,
            method: HapiRoutes[routeKey].method,
            config: typeof HapiRoutes[routeKey].config !== 'function' ? HapiRoutes[routeKey].config : {
                handler: HapiRoutes[routeKey].config
            }
        });
    });
}

/**
 * Read files in a directory recursively
 * Filter function used filter necessary components
 *
 * @param {string} directoryPath
 * @param {function} filterFunc
 * @returns {object} FsItems
 */

function _readDirectoryRecursively(directoryPath, filterFunc) {

    var container = [];
    var items = Fs.readdirSync(directoryPath);

    items.forEach(function (item) {
        var path = Path.join(directoryPath, item);
        var stat = Fs.statSync(path);
        if ( stat.isDirectory() ) {
            container = container.concat(_readDirectoryRecursively(path, filterFunc));
        }
        else {
            var fsItem = {
                path: path,
                stat: stat,
                name: item
            };

            if (filterFunc(fsItem)) {
                container.push(fsItem);
            }
        }
    });

    return container;
}


module.exports.pipe = _pipe;