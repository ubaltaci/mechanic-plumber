module.exports = function (blueprintName) {
    if (blueprintName == "update" ||
        blueprintName == "create" ) {
        return {
            maxBytes: 209715200,
            output: "file",
            parse: true
        };
    }
    return null;
};