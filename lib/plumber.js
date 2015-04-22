/**
 *
 * Created by uur on 25/06/14.
 */

var Fs = require("fs");
var Path = require("path");
var _ = require("lodash");
var Callsite = require("callsite");
var Clc = require("cli-color");

var Payload = require("./payload");
var BlueprintRoutes = require("./blueprint_routes");

var Plugin;
var PluginName;
var Config;
var PluginPaths = {};

// Controller files key - require
var Controllers = {};

// Routes.js
var Routes = [];

// URL_PATH -> {method, path, config}
var HapiRoutes = {};

module.exports = {
    pipe: _pipe,
    pipeModels: _pipeModels,
    pipeServices: _pipeServices,
    pipePre: _pipePre
};


/**
 * Pipe Pre directory into mechanic.pre
 * object for further usage.
 * Each file exports a single object {availableAfter, fn(request, reply), assign}
 * @returns {{}}
 * @private
 */
function _pipePre(preFilePath) {

    preFilePath = preFilePath || "utils/pre/pre.js";
    var preFile;
    var stack = Callsite();
    var requester = stack[1].getFileName();

    var mainPreFilePath = Path.join(Path.dirname(requester), preFilePath);

    if (Fs.existsSync(mainPreFilePath)) {
        var stat = Fs.statSync(mainPreFilePath);
        if (stat.isFile()) {
            preFile = require(mainPreFilePath);
        }
    }

    return preFile;
}

/**
 * Pipe Service directory into mechanic.service
 * object for further usage.
 * Each file exports a single function
 * @returns {{}}
 * @private
 */
function _pipeServices(serviceDirectory) {

    serviceDirectory = serviceDirectory || "utils/services";

    var services = {};
    var stack = Callsite();
    var requester = stack[1].getFileName();

    var mainServiceFolder = Path.join(Path.dirname(requester), serviceDirectory);

    if (Fs.existsSync(mainServiceFolder)) {
        var stat = Fs.statSync(mainServiceFolder);
        if (stat.isDirectory()) {
            var serviceItems = _readDirectoryRecursively(mainServiceFolder, _filterJavascriptFile);
            serviceItems.forEach(function (serviceItem) {
                services[_trimExtFromFileName(serviceItem.name)] = require(serviceItem.path);
            });
        }
    }

    return services;
}

/**
 *
 * @returns {{}}
 * @private
 */
function _pipeModels() {

    var models = {};

    var stack = Callsite();
    var requester = stack[1].getFileName();
    var mainPluginFolder = Path.join(Path.dirname(requester), "plugins");

    var pluginFolders = Fs.readdirSync(mainPluginFolder);
    pluginFolders.forEach(function (pluginFolder) {
        pluginFolder = Path.join(mainPluginFolder, pluginFolder);
        if (Fs.existsSync(pluginFolder)) {
            var stat = Fs.statSync(pluginFolder);
            if (stat.isDirectory()) {
                var modelFolder = Path.join(pluginFolder, "model");
                if (Fs.existsSync(modelFolder)) {
                    var stat2 = Fs.statSync(modelFolder);
                    if (stat2.isDirectory()) {
                        _.extend(models, _pipeModelsInFolder(modelFolder));
                    }
                }
            }
        }
    });
    return models;
}

/**
 * Promise for returning all model files.
 * @param {string} folder
 * @return {object}
 */
function _pipeModelsInFolder(folder) {

    var pluginModels = {};
    var modelFsItems = _readDirectoryRecursively(folder, _filterJavascriptFile);
    modelFsItems.forEach(function (modelFsItem) {
        pluginModels[_getModelName(modelFsItem.name)] = require(modelFsItem.path);
    });

    return pluginModels;
}

/**
 * Get model name from filename
 * @param fileName
 * @return {string} modelName
 */
function _getModelName(fileName) {

    var filename = _trimExtFromFileName(fileName).toLocaleLowerCase();
    var frags = filename.split("_");
    for (var i = 0; i < frags.length; i++) {
        frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1);
    }
    filename = frags.join("");

    return filename.charAt(0).toLocaleUpperCase() + filename.slice(1);
}

/**
 * Anything ends with *.js
 * @param fsItem
 * @return {boolean}
 */
function _filterJavascriptFile(fsItem) {

    return /(.*)\.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

function _pipe(plugin, config) {

    if (!plugin) {
        console.log(Clc.red.bold("Pipe's first and only argument must be plugin itself"));
        process.exit(1);
    }

    Plugin = plugin;
    Config = config;
    PluginPaths = {};
    Controllers = {};
    Routes = [];
    HapiRoutes = {};

    var stack = Callsite();
    var requester = stack[1].getFileName();

    PluginPaths.mainPath = Path.dirname(requester);
    PluginPaths.mainFile = Path.basename(requester);
    PluginName = _trimExtFromFileName(PluginPaths.mainFile);

    _setPluginPaths();

    if (PluginPaths.routeFile) {
        Routes = require(PluginPaths.routeFile);
    }

    if (PluginPaths.controllerDirectory) {
        _pipeControllers();
    }
}

/**
 * Set plugin paths.
 * @private
 */
function _setPluginPaths() {

    // trim .js from filename
    var mainFileName = _trimExtFromFileName(PluginPaths.mainFile);
    // Set *_routes.js
    PluginPaths.routeFile = Path.join(PluginPaths.mainPath, mainFileName + "_routes.js");

    // Set controller directory
    PluginPaths.controllerDirectory = Path.join(PluginPaths.mainPath, "controller");

    if (!Fs.existsSync(PluginPaths.routeFile) || !Fs.statSync(PluginPaths.routeFile).isFile()) {
        PluginPaths.routeFile = null;
    }

    if (!Fs.existsSync(PluginPaths.controllerDirectory) || !Fs.statSync(PluginPaths.controllerDirectory).isDirectory()) {
        PluginPaths.controllerDirectory = null;
    }
}

/**
 * Pipe Controller files.
 * @private
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
 * @private
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
            //// Plug & Play with /
            if (typeof relatedAction == "function") {
                relatedAction = {
                    handler: relatedController[controllerAction]
                };
            }
            if (!relatedAction) {
                throw new Error("Controller action -> " + controllerAction + " : ( " + controllerAction + "@" + controllerName + " ) defined in routes.js not found in " + controllerName);
            }

            // Controller and Action found added!
            HapiRoutes[route.path + "@" + route.method] = {
                method: route.method,
                path: route.path || "GET",
                config: relatedAction
            };
        }
        else { // default blueprint if not contain `@`

            controllerName = config.trim();
            relatedController = Controllers[controllerName];

            if (!relatedController) {
                throw new Error("Controller : ( " + controllerName + ".js ) not found defined in routes.js");
            }

            Object.keys(BlueprintRoutes).forEach(function (blueprintRoute) {

                var idParameter = controllerName.substr(0, controllerName.indexOf("_controller")).toLocaleLowerCase();

                var path = route.path + BlueprintRoutes[blueprintRoute].path.replace("{id}", "{" + idParameter + "id}");

                var method = BlueprintRoutes[blueprintRoute].method;

                if (route.except && route.except.indexOf(blueprintRoute) >= 0) {
                    ;//do nothing
                }
                else if (!relatedController[blueprintRoute] && ((blueprintRoute === "sorting") || (blueprintRoute === "sorted") || (blueprintRoute === "delete-info")|| (blueprintRoute === "update-info"))) {
                    ;//do nothing
                }
                else if (!relatedController[blueprintRoute]) {
                    console.log("Controller : ( " + controllerName + ".js ) defined as a blueprint in routes.js but " + blueprintRoute + " not found in controller file");
                }
                else {
                    //// Plug & Play with /
                    if (typeof relatedController[blueprintRoute] == "function") {
                        relatedController[blueprintRoute] = {
                            handler: relatedController[blueprintRoute]
                        };
                    }

                    if (!relatedController[blueprintRoute].payload && Payload(blueprintRoute)) {
                        relatedController[blueprintRoute].payload = Payload(blueprintRoute);
                    }

                    if (!relatedController[blueprintRoute].payload && Payload(blueprintRoute)) {
                        relatedController[blueprintRoute].payload = Payload(blueprintRoute);
                    }

                    // Controller and Action found added!
                    HapiRoutes[path + "@" + method] = {
                        method: method,
                        path: path,
                        config: relatedController[blueprintRoute]
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
 * @private
 */
function _trimExtFromFileName(fileName) {
    return fileName && fileName.split(".")[0];
}

/**
 * Anything ends with *Controller.js under "controller" folder.
 * @param fsItem
 * @return {boolean}
 * @private
 */
function _filterControllerFile(fsItem) {
    return /(.*)_controller.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

/**
 * Pipe all routes into plugin
 * @private
 */
function _pipeAllIntoHapi() {

    var routeKeys = Object.keys(HapiRoutes);
    routeKeys.forEach(function (routeKey) {

        if (mechanic.pre) {
            for(var i = mechanic.pre.length-1; i >= 0 ;i--) {
                var pre = mechanic.pre[i];
                if (pre.plugins && pre.plugins.indexOf(PluginName) == -1) {
                    continue;
                }
                if (pre.availableAfter && HapiRoutes[routeKey].path.indexOf(pre.availableAfter) != -1) {

                    if (!HapiRoutes[routeKey].config.pre) {
                        HapiRoutes[routeKey].config.pre = [];
                    }

                    HapiRoutes[routeKey].config.pre.unshift({
                        method: pre.method,
                        assign: pre.assign
                    });
                }
            }
        }

        // Plug & Play with /
        if (!HapiRoutes[routeKey].path.endsWith("/")) {
            Plugin.route({
                path: HapiRoutes[routeKey].path + "/",
                method: HapiRoutes[routeKey].method ? HapiRoutes[routeKey].method : "GET",
                config: HapiRoutes[routeKey].config
            });
        }
        Plugin.route({
            path: HapiRoutes[routeKey].path,
            method: HapiRoutes[routeKey].method ? HapiRoutes[routeKey].method : "GET",
            config: HapiRoutes[routeKey].config
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
 * @private
 */

function _readDirectoryRecursively(directoryPath, filterFunc) {

    var container = [];
    var items = Fs.readdirSync(directoryPath);

    items.forEach(function (item) {
        var path = Path.join(directoryPath, item);
        var stat = Fs.statSync(path);
        if (stat.isDirectory()) {
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
