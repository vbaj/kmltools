// NW libraries
var gui  = require("nw.gui");

// Node libraries
var fs            = require("fs");
var os            = require("os");
var path          = require("path");
var child_process = require("child_process");

// Get application window
var win  = gui.Window.get();

// Shorthands to make code more HTML DOM friendly.
var window   = win.window;
var document = window.document;

// Namespace utils
utils = {}

// HTML DOM shorthands used in the code.
utils.el   = function(id)  { return document.getElementById(id);   }
utils.tag  = function(tag) { return document.createElement(tag);   }
utils.text = function(text){ return document.createTextNode(text); }

// Runs a command or opens a file in os default.
utils.open = function(file){
    if(!fs.existsSync(file)) return;
    gui.Shell.openItem(file);
}

utils.run = function(cmd, argArray){
    child_process.spawnSync(cmd, argArray);
}

// Deletes a path.
utils.remove = function(path){
    if(!fs.existsSync(path)) return;
    fs.unlinkSync(path);
}

// Reads and returns contents of a file.
utils.read = function(file){
    if(!fs.existsSync(file)) return;
    return fs.readFileSync(file, "utf8");
}

// Writes text to a file.
utils.write = function(file, text){
    text = text || "";
    fs.writeFileSync(file, text);
}

// Returns HOME path of current user.
utils.userhome = function(){
    return process.env.HOME || process.env.USERPROFILE;
}

// Utility function that traverses through folder-tree and appends paths to two arrays
// one each for files and folders.
utils.DirectoryTree = function(folder, folders, files){
    if(typeof folders == "undefined") folders = [];
    if(typeof files   == "undefined") files   = [];
    var dir = fs.readdirSync(folder);
    for(var i = 0; i < dir.length; i++){
        if(fs.statSync(path.join(folder, dir[i])).isDirectory()){
            folders.push(path.join(folder, dir[i]));
            utils.DirectoryTree(path.join(folder, dir[i]), folders, files);
        } else if(fs.statSync(path.join(folder, dir[i])).isFile()){
            files.push(path.join(folder, dir[i]));
        }
    }
}

// Standard XML escape characters.
utils.XMLEscape = function(text){
    if(typeof text == "undefined" || text === null) return text;
    text = new String(text);
    text = text.replace(/</g, "&lt;");
    text = text.replace(/>/g, "&gt;");
    text = text.replace(/'/g, "&apos;");
    text = text.replace(/"/g, "&quot;");
    text = text.replace(/&(?!lt;|gt;|apos;|quot;|amp;)/g, "&amp;");
    return text;
}

// Standard XML unescape characters.
utils.XMLUnescape = function(text){
    if(typeof text == "undefined" || text === null) return text;
    text = new String(text);
    text = text.replace(/&lt;/g,   "<");
    text = text.replace(/&gt;/g,   ">");
    text = text.replace(/&apos;/g, "'");
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&amp;/g,  "&");
    return text;
}

// -------------------------------------------------------------------
// Project specific utility functions. -------------------------------
// -------------------------------------------------------------------

// Object to hold selected columns from CSV to convert to KML.
utils.KMLCols = function(){
    return new Object({ // name, lat, lon are required, rest are optional.
        "name"  : undefined, // Column containing name/label of placemark.
        "lon"   : undefined, // Column containing longitude of placemark.
        "lat"   : undefined, // Column containing latitude of placemark.
        "height": undefined, // Column containing height of placemark relative to ground.
        "eyealt": undefined  // Column containing eye altitude in km at which a region would load.
    });
}

// Writes CSV (path) from data in two dimensional array lines.
utils.ArrayToCSV = function(path, lines){
    var s = "";
    for(var i = 0; i < lines.length; i++){
        for(var j = 0; j < lines[i].length; j++){
            if(j > 0) s += ",";
            lines[i][j] = utils.XMLUnescape(lines[i][j]);
            if(lines[i][j].match(",")) s += '"' + lines[i][j] + '"';
            else s += lines[i][j];
        }
        s += "\r\n";
    }
    console.log(s);
    utils.write(path, s);
}

// Reads CSV (path) and returns data in two dimensional array.
// First line is treated as column headers.
utils.CSVToArray = function(path){
    var s = utils.read(path);
    if(typeof s == "undefined") return [];
    var lines = s.split(/\r\n|\r|\n/g);
    var line;
    for(var i = 0; i < lines.length; i++){
        // split on commas ignoring inside double-quotes.
        line = lines[i].split(/,(?=(?:[^"]|"[^"]*")*$)/);
        for(var j = 0; j < line.length; j++){
            line[j] = utils.XMLEscape(line[j]);
        }
        lines[i] = line;
    }
    return lines;
}

// New blank html as HTML DOM.
utils.HTML = function(){
    return new DOMParser().parseFromString(
        "<!DOCTYPE html>" +
        "<html>" +
        "<head></head>" +
        "<body></body>" +
        "</html>", "text/xml"
    );
}

// New blank kml as XML DOM.
utils.KML = function(){
    return new DOMParser().parseFromString(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
        "<kml xmlns=\"http://www.opengis.net/kml/2.2\">" +
        "<Document></Document>" +
        "</kml>", "text/xml"
    );
}

// Serializes KML to path.
utils.SerializeKML = function(kml, path){
    utils.write(path, new XMLSerializer().serializeToString(kml));
}

// Returns ready to serialize KML from CSV in array.
// 'lines' is two dimensional array of CSV data. First line is treated as column headers.
// 'kmlcols' holds column positions of geo-attributes.
// 'output' is path to output KML.
// 'makepath', if true, will join continuous placemearks having lat-lon.
// 'makedistances', if true, will join placemearks having lat-lon for makedistances.
// 'flatten', if true, will set height component in path to 0.
// 'attributes', if true, will store attributes along with placemark.
utils.ArrayToKML = function(lines, kmlcols, makepath, makedistances, flatten, attributes){
    // Exit if lines do not have data.
    if(!Array.isArray(lines)) return;
    makepath      = !!makepath;      // Make Boolean.
    makedistances = !!makedistances; // Make Boolean.
    flatten       = !!flatten;       // Make Boolean.
    var kml         = utils.KML(); // New blank KML as XML DOM.
    var placemarks  = [], placemark, name, lat, lon, height;
    var tessellates = [], tessellate = "", pathpoints    = 0;
    var distances   = [], distance   = [];
    for(var i = 1; i < lines.length; i++){
        placemark = utils.KMLPlacemark(kml, lines[i], kmlcols, attributes, lines[0]);
        name   = lines[i][kmlcols.name];
        lat    = parseFloat(lines[i][kmlcols.lat]);
        lon    = parseFloat(lines[i][kmlcols.lon]);
        height = parseFloat(lines[i][kmlcols.height]);
        if(flatten || isNaN(height)) height = 0; // Flattens path.
        // If placemark has a name, it should appear in the list.
        if(typeof name != "undefined") placemarks.push(placemark);
        // If a place can be marked.
        if(!(isNaN(lat) || isNaN(lon) || typeof name == "undefined")){
            distance.push(name); // Insert name.
            distance.push(lon + "," + lat + "," + height); // Insert location.
            // If distance is measurable between two consecutive placemarks.
            if(distance.length >= 4){
                distances.push(distance[0] + " to " + distance[2]); // Push name for distance.
                distances.push(distance[1] + " " + distance[3]); // Push path for distance.
                distance.shift(); distance.shift(); // Remove used penultimate anme and point.
            }
        } else { // If a point cannot be marked, initialize.
            distance = [];
        }
        // If place cannot be marked, break the path.
        if(isNaN(lat) || isNaN(lon) || typeof name == "undefined"){
            // Make path only if at least two consecutive points are legal placemerks.
            if(pathpoints > 1) tessellates.push(tessellate);
            tessellate     = ""; // Initialize for new path.
            pathpoints     = 0;  // Initialize for new path.
        } else {
            if(makepath){ // Add to path.
                tessellate += lon + "," + lat + "," + height + " ";
                pathpoints++;
            }
        }
    }
    // Append last tessellate if not appended due to unmarked placemark.
    if(pathpoints > 1) tessellates.push(tessellate);
    // Final KML will have a 'Markings' folder containing three folders,
    // namely 'Paths', 'Distances' and 'Points' respectively.
    // Eye Altitude will be applied to 'Points' only.
    var markings = utils.KMLFolder(kml, "Markings");
    var folder   = utils.KMLFolder(kml, "Paths");
    for(var i = 0; i < tessellates.length; i++){
        folder.appendChild(utils.KMLTessellate(kml, "Path_" + i, tessellates[i]));
    }
    markings.appendChild(folder);
    var folder   = utils.KMLFolder(kml, "Distances");
    for(var i = 0; i < distances.length; i += 2){
        folder.appendChild(utils.KMLTessellate(kml, distances[i], distances[i + 1]));
    }
    markings.appendChild(folder);
    folder = utils.KMLFolder(kml, "Points", kmlcols);
    for(var i = 0; i < placemarks.length; i++){
        folder.appendChild(placemarks[i]);
    }
    markings.appendChild(folder);
    kml.getElementsByTagName("Document")[0].appendChild(markings);
    return kml;
}

// Converts a KML to Array.
utils.KMLToArray = function(kmlfile){
    var kmltext    = utils.read(kmlfile);
    var kmlcols    = utils.ReadKMLCols(kmlfile);
    var kml        = new DOMParser().parseFromString(kmltext, "text/xml");
    var placemarks = kml.getElementsByTagName("Placemark");
    var placemark, description, html, coords;
    var name, lon, lat, height;
    var headerstaken = false;
    var line, lines = [];
    for(var i = 0; i < placemarks.length; i++){
        placemark = placemarks[i];
        if(placemark.getElementsByTagName("LineString").length > 0) continue; // Skip paths.
        name   = placemark.getElementsByTagName("name")[0].textContent;
        coords = placemark.getElementsByTagName("coordinates");
        if(coords.length > 0){
            coords = coords[0].textContent.split(",");
            lon    = coords[0];
            lat    = coords[1];
            height = coords[2];
        } else {
            lon    = undefined;
            lat    = undefined;
            height = undefined;
        }
        description = placemark.getElementsByTagName("description");
        // if(!description) continue; // No description.
        try {
            html = new DOMParser().parseFromString(description[0].textContent);
        } catch(e) {
            html = undefined;
        }
        try{ html = description[0].textContent.match(/<td>(.*?)<\/td>/gi); } catch(e){}
        if(Array.isArray(html)){
            if(!headerstaken){
                line = [];
                for(var j = 0; j < html.length; j += 2){
                    html[j] = html[j].replace(/<\/?td>/gi, "");
                    line.push(html[j]);
                }
                headerstaken = true;
                lines[0] = line;
            }
            line = [];
            for(var j = 1; j < html.length; j += 2){
                html[j] = html[j].replace(/<\/?td>/gi, "");
                if(kmlcols){
                    if(!!name    && kmlcols.name    * 2 + 1 === j) html[j] = name;
                    if(!!lat     && kmlcols.lat     * 2 + 1 === j) html[j] = lat;
                    if(!!lon     && kmlcols.lon     * 2 + 1 === j) html[j] = lon;
                    if(!!height  && kmlcols.height  * 2 + 1 === j) html[j] = height;
                }
                line.push(html[j]);
            }
            lines.push(line);
        }
    }
    return lines;
}

utils.ReadKMLCols = function(kmlfile){
    var kmlcontents = utils.read(kmlfile);
    var kmlcols     = JSON.parse(utils.XMLUnescape(kmlcontents.match(/({.*?name.*?:.*?lon.*?:.*?lat.*})/gim)));
    return kmlcols;
}

// Felt LOD in pixels to be difficult to decide, therefore, thought to
// decide on eye altitude on display of a point.
// Converts eye-altitude in approximate LoD pixels.
utils.KMLEyeAltToLod = function(eyealt, degree){
    // 1 degree at LoD 1024 approximates to 100 km eye altitude.
    // Increase LoD to zoom-in or reduce eye altitude.
    // Increase in degree size means increase in LoD.
    if(typeof degree === "undefined"){
        degree = 1;
    } else {
        degree = parseFloat(degree);
        if(isNaN(degree)) degree = 1;
    }
    return 1024 * 100 * degree / eyealt;
}

// Creates and returns a KML Folder.
utils.KMLFolder = function(xml, name, kmlcols){
    var folder   = xml.createElement("Folder");
    var nametag  = xml.createElement("name");
    var nametext = xml.createTextNode(utils.XMLEscape(name));
    nametag.appendChild(nametext);
    folder.appendChild(nametag);
    if(typeof kmlcols != "undefined"){
        var description = xml.createElement("description");
        var json        = JSON.stringify(kmlcols);
        var text        = xml.createTextNode(json);
        var cdata       = xml.createCDATASection(
            new XMLSerializer().serializeToString(text)
        );
        description.appendChild(cdata);
        folder.appendChild(description);
    }
    return folder;
}

// Creates a placemark with attributes.
utils.KMLPlacemark = function(xml, line, kmlcols, attributes, headers){
    var placemark = xml.createElement("Placemark");
    var nametag   = xml.createElement("name");
    var nametext  = xml.createTextNode(line[kmlcols.name]);
    nametag.appendChild(nametext);
    placemark.appendChild(nametag);
    var lat = parseFloat(line[kmlcols.lat]);
    var lon = parseFloat(line[kmlcols.lon]);
    if(!isNaN(lat) && !isNaN(lon)){
        // If a point can be marked.
        // Add LOD in placemark, if provided.
        var eyealt = parseFloat(line[kmlcols.eyealt]);
        if(!isNaN(eyealt) && eyealt > 0){
            var region = utils.KMLRegion(xml, lat, lon, eyealt, 1);
            placemark.appendChild(region);
        }
        // Mark point in placemark.
        // Set height, if provided.
        var height = parseFloat(line[kmlcols.height]);
        if(isNaN(height)) height = 0;
        var point = xml.createElement("Point");
        if(height > 0){
            var alt = xml.createElement("altitudeMode");
            var rtg = xml.createTextNode("relativeToGround");
            alt.appendChild(rtg);
            point.appendChild(alt);
        }
        var coordstag  = xml.createElement("coordinates");
        var coordstext = xml.createTextNode(lon + "," + lat + "," + height);
        coordstag.appendChild(coordstext);
        point.appendChild(coordstag);
        placemark.appendChild(point);
    }
    // Set attributes table in description, if selected.
    if(!!attributes){
        var html = utils.HTML(); // New blank HTML DOM.
        var head = html.getElementsByTagName("head")[0];
        var link = html.createElement("link");
            link.setAttribute("rel", "stylesheet");
            link.setAttribute("type", "text/css");
            link.setAttribute("href", "attributes.css");
        head.appendChild(link);
        var script = html.createElement("script");
            script.setAttribute("type", "text/javascript");
            script.setAttribute("src", "attributes.js");
        head.appendChild(script);
        var body = html.getElementsByTagName("body")[0];
        // Tabular attribute data stored in 'description'.
        var table = html.createElement("table");
        var tr, th, td, text;
        // Table header ... Attribute-Value pairs.
        tr   = html.createElement("tr");
        th   = html.createElement("th");
        text = html.createTextNode("Attribute");
        th.appendChild(text);
        tr.appendChild(th);
        th   = html.createElement("th");
        text = html.createTextNode("Value");
        th.appendChild(text);
        tr.appendChild(th);
        table.appendChild(tr);
        // Attribute data. Description will allow to pop balloon on click.
        for(var i = 0; i < line.length; i++){
            tr   = html.createElement("tr");
            td   = html.createElement("td");
            text = html.createTextNode(headers[i]);
            td.appendChild(text);
            tr.appendChild(td);
            td   = html.createElement("td");
            text = html.createTextNode(line[i]);
            td.appendChild(text);
            tr.appendChild(td);
            table.appendChild(tr);
        }
        body.appendChild(table);
        // Serialize and append tabular attribute data with styles to 'description' in CDATASection.
        var description = xml.createElement("description");
        var cdata       = xml.createCDATASection(
            new XMLSerializer().serializeToString(html)
        );
        description.appendChild(cdata);
        placemark.appendChild(description);
    }
    return placemark;
}

// Creates a region of LOD to be appended to a folder or marking.
utils.KMLRegion = function(xml, lat, lon, eyealt, degrees){
    degrees = parseFloat(degrees);
    if(isNaN(degrees)) degrees = 1;
    var lodpx = utils.KMLEyeAltToLod(eyealt, degrees);
    var half = degrees / 2;
    var region = xml.createElement("Region");
    var box    = xml.createElement("LatLonAltBox");
    var east = xml.createElement("east" );
        east.appendChild(xml.createTextNode(lon + half));
    box.appendChild(east);
    var west = xml.createElement("west" );
        west.appendChild(xml.createTextNode(lon - half));
    box.appendChild(west);
    var north = xml.createElement("north");
        north.appendChild(xml.createTextNode(lat + half));
    box.appendChild(north);
    var south = xml.createElement("south");
        south.appendChild(xml.createTextNode(lat - half));
    box.appendChild(south);
    region.appendChild(box);
    var lod = xml.createElement("Lod");
    var minLod = xml.createElement("minLodPixels");
        minLod.appendChild(xml.createTextNode(lodpx));
    lod.appendChild(minLod);
    var maxLod = xml.createElement("maxLodPixels");
        maxLod.appendChild(xml.createTextNode(-1));
    lod.appendChild(maxLod);
    region.appendChild(lod);
    return region;
}

// Creates a path.
utils.KMLTessellate = function(xml, name, coordlist){
    var placemark = xml.createElement("Placemark");
    var nametag   = xml.createElement("name");
    var nametext  = xml.createTextNode(utils.XMLEscape(name));
    nametag.appendChild(nametext);
    placemark.appendChild(nametag);
    var linestring     = xml.createElement("LineString");
    var tessellatetag  = xml.createElement("tessellate");
    var tessellatetext = xml.createTextNode(1);
    tessellatetag.appendChild(tessellatetext);
    linestring.appendChild(tessellatetag);
    var coordstag = xml.createElement("coordinates");
    var coordstext = xml.createTextNode(coordlist);
    coordstag.appendChild(coordstext);
    linestring.appendChild(coordstag);
    placemark.appendChild(linestring);
    return placemark;
}

// Detects if running on Windows platform to make use of ActiveX technology
utils.isWin = function(){ return /win/.test(os.platform()); }
