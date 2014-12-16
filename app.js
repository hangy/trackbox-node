var http = require('http')
var fs = require('fs')
var url = require('url');
var request = require('request-json');
var mongodb = require('mongodb');

function getEvent(state) {
  if (state === 'Inside') return 'enter';
  if (state === 'Outside') return 'exit';
  return 'unknown';
}

function getEventDate(datetime) {
  if (datetime) return new Date(datetime);
  else return new Date();
}

function getUsername(req) {
  var header = req.headers.authorization || '';      // get the header
  var token = header.split(/\s+/).pop() || '';       // and the encoded auth token
  var auth = new Buffer(token, 'base64').toString(); // convert from base64
  var parts = auth.split(/:/);                       // split on colon
  var username = parts[0];
  return username;
}

function handleGetRequest(req, res) {
    var username = getUsername(req);
    var u = url.parse(req.url, true);
    if (u && u.query && u.query.geofence && u.query.state && (u.query.state === 'Inside' || u.query.state === 'Outside')) {
      insertNewEvent(req, res, username, u);
    } else if (u && u.query && u.query.geofence && !(u.query.state && (u.query.state === 'Inside' || u.query.state === 'Outside'))) {
      getLatestEvent(req, res, username, u.query.geofence, u);
    } else {
      getAllEvents(req, res, username, u);
    }
}

function insertNewEvent(req, res, username, u) {
  var event = {
    event: getEvent(u.query.state),
    entityType: 'user',
    entityId: username,
    targetEntityType: 'geofence',
    targetEntityId: u.query.geofence,
    eventTime: getEventDate(u.query.datetime)
  };

  getEventCollection(function(err, conn, coll) {
    if (err) {
      writeErr(res, err);
    } else {
      coll.insert(event, {safe: true}, function(err, records) {
        if (err) {
          conn.close();
          writeErr(res, err);
        } else {
          conn.close();
          writeResult(res, records);
        }
      });
    }
  });
}

function getLatestEvent(req, res, username, geofence, u) {
  getEventCollection(function(err, conn, coll) {
    if (err) {
      writeErr(res, err);
    } else {
      var query = {
        entityType: 'user',
        entityId: username,
        targetEntityType: 'geofence',
        targetEntityId: u.query.geofence
      };
      var options = {
        sort: [['eventTime', 'desc']]
      };
      coll.findOne(query, options, function(err, document) {
        if (err) {
          conn.close();
          writeErr(res, err);
        } else {
          var header = {
            'Content-Type': 'text/plain',
          };

          if (document) {
            header['Last-Modified'] = document.eventTime;
            header['ETag'] = document._id;
          }

          res.writeHead(200, header);
          if (document && document.event == 'enter') {
            res.write('Inside');
          } else {
            res.write('Outside');
          }

          conn.close();
          res.end();
        }
      });
    }
  });
}

function getAllEvents(req, res, username, geofence, u) {
  getEventCollection(function(err, conn, coll) {
    if (err) {
      writeErr(res, err);
    } else {
      var query = {
        entityType: 'user',
        entityId: username
      };
      var options = {
        sort: [['eventTime', 'desc']]
      };
      coll.find(query, options).toArray(function(err, documents) {
        if (err) {
          conn.close();
          writeErr(res, err);
        } else {
          conn.close();
          writeResult(res, documents);
        }
      });
    }
  });
}

function getEventCollection(callback) {
  mongodb.connect('mongodb://localhost/geofence', function(err, conn) {
    if (err) callback(err, null, null);
    conn.collection('Event', function(err, coll) {
      if (err) {
        conn.close();
        callback(err, null, null);
      } else {
        callback(null, conn, coll);
      }
    });
  });
}

function writeErr(res, err) {
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.write(JSON.stringify({ timestamp: new Date(), errors: err }));
  res.end();
}

function writeResult(res, result) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write(JSON.stringify({ timestamp: new Date(), result: result }));
  res.end();
}

http.createServer(function (req, res) {
  if (req.method == 'GET') {
    handleGetRequest(req, res);
  } else {
    res.writeHead(500);
    res.end();
  }
}).listen(9615);
