module.exports = function(target, options) {
  if (target.startsWith("source:")) {
    // just ignores the source prefix:
    target = target.substring(7);
  }
  return options.defaultResolver(target, options);
};
