/**
 *
 * @param {object} request
 * @param {object} request.yar - yar.
 * @param {function} request.yar.flash - flash.
 * @param {function} reply
 * @param {object} data
 * @returns {Function}
 */

"use strict";

const Async = require("async");

module.exports = (request, reply, data) => {

    const model = data["model"];
    if (!model) {
        request.yar.flash("error", `In path: ${request.path} "MODEL" must be passed with SORTED - blueprint settings.`);
        return reply.redirect("/");
    }

    const sortField = data["sortField"];
    if (!sortField) {
        request.yar.flash("error", `In path: ${request.path} "sortField" must be passed with SORTED - blueprint settings.`);
        return reply.redirect("/");
    }

    const sortData = request.payload["sortData"];
    if (!sortData) {
        request.yar.flash("error", "Payload not valid");
        return reply.redirect(request.pre["baseurl"]);
    }

    const sortDatas = sortData.split("|");

    Async.each(sortDatas, (modelId, eachCallback) => {

        model.findOneAndUpdate({_id: modelId}, {[sortField]: sortDatas.indexOf(modelId)}, eachCallback);

    }, (error) => {

        if (error) {
            request.yar.flash("error", error);
            return reply.redirect(request.pre["baseurl"]);
        }

        request.yar.flash("success", "Successfully sorted!");

        const version = data["version"];
        if (!version) {
            return reply.redirect(request.pre["baseurl"]);
        }

        return version(request, version, `DELETE | ${request.path}`, () => {
            return reply.redirect(request.pre["baseurl"]);
        });
    });
};