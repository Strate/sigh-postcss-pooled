import _ from 'lodash'
import Promise from 'bluebird'
import { Bacon } from 'sigh-core'
import { mapEvents } from 'sigh-core/lib/stream'

function postcssPooledTask(opts) {
  // this function is called once for each subprocess in order to cache state,
  // it is not a closure and does not have access to the surrounding state, use
  // `require` to include any modules you need, for further info see
  // https://github.com/ohjames/process-pool
  var log = require('sigh-core').log;
  var pluginsFactory = require(opts.pluginsFactory);
  var postcss = require("postcss")(pluginsFactory());

  // this task runs inside the subprocess to transform each event
  return event => {
    return postcss.process(event.data, {
      from: event.path,
      map: {
        inline: false
      }
    }).then(result => {
      return {
        data: result.css,
        map: result.map
      }
    });
  }
}

function adaptEvent(compiler) {
  // data sent to/received from the subprocess has to be serialised/deserialised
  return event => {
    if (event.type !== 'add' && event.type !== 'change')
      return event;

    if (event.fileType !== 'css') return event;

    return compiler(_.pick(event, 'type', 'data', 'path', 'projectPath', 'sourcePath')).then(({data, map}) => {
      event.data = data;

      if (map) {
        event.applySourceMap(map);
      }

      return event
    })
  }
}

var pooledProc;

export default function(op, opts = {}) {
  if (! pooledProc)
    pooledProc = op.procPool.prepare(postcssPooledTask, opts, { module });

  return mapEvents(op.stream, adaptEvent(pooledProc))
}
