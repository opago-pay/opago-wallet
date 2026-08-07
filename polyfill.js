import 'react-native-get-random-values';
import 'fast-text-encoding';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

global.process = global.process || {};
if (typeof global.process.version !== 'string') {
  global.process.version = '';
}

if (typeof global.DOMException === 'undefined') {
  global.DOMException = class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'DOMException';
    }
  };
}

if (
  typeof AbortSignal !== 'undefined' &&
  typeof AbortSignal.prototype.throwIfAborted !== 'function'
) {
  AbortSignal.prototype.throwIfAborted = function () {
    if (this.aborted) {
      const error = this.reason || new Error('The operation was aborted');
      if (!this.reason) error.name = 'AbortError';
      throw error;
    }
  };
}
