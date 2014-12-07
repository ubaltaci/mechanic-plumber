/**
 *
 * Created by uur on 18/11/14.
 */

module.exports = {
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
    "update-info": {
        method: "POST",
        path: "/{id}/update-info"
    },
    "delete": {
        method: "POST",
        path: "/{id}/delete"
    },
    "delete-info": {
        method: "POST",
        path: "/{id}/delete-info"
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