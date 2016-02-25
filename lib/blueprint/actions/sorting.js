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

module.exports = (request, reply, data) => {


    const query = data["query"];
    if (!query) {
        request.yar.flash("error", `In path: ${request.path} "QUERY" must be passed with SORTING - blueprint settings.`);
        return reply.redirect("/");
    }

    const viewPath = data["view"];
    if (!viewPath) {
        request.yar.flash("error", `In path: ${request.path} "VIEW" must be passed with SORTING - blueprint settings.`);
        return reply.redirect("/");
    }

    const viewConfig = {};

    query.exec((error, records) => {

        if (error) {
            viewConfig.error = error;
        }

        viewConfig.records = records;
        return reply.view(viewPath, viewConfig);
    });
};