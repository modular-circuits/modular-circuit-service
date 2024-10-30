// @ts-nocheck

// Check if the native function not exist
if (!String.prototype.replaceAll)
  Object.defineProperty(String.prototype, 'replaceAll', {
    // Define replaceAll as a prototype for (Mother/Any) String
    configurable: true,
    writable: true,
    enumerable: false, // Editable & non-enumerable property (As it should be)
    value: function (search, replace) {
      // Set the function by closest input names (For good info in consoles)
      return this.replace(
        // Using native String.prototype.replace()
        Object.prototype.toString.call(search) === '[object RegExp]' // IsRegExp?
          ? search.global // Is the RegEx global?
            ? search // So pass it
            : RegExp(search.source, /\/([a-z]*)$/.exec(search.toString())[1] + 'g') // If not, make a global clone from the RegEx
          : RegExp(String(search).replace(/[.^$*+?()[{|\\]/g, '\\$&'), 'g'), // Replace all reserved characters with '\' then make a global 'g' RegExp
        replace,
      ) // passing second argument
    },
  })
