class AsyncService {
  constructor() {
    this.asyncFileMap = new Map();
  }

  setFileMap(subpackageName, file) {
    const fileSet = this.getFileMapByName(subpackageName);
    fileSet.add(file);
    this.asyncFileMap.set(subpackageName, fileSet);
  }

  getFileMapByName(subpackageName) {
    return this.asyncFileMap.get(subpackageName) || new Set();
  }

  isHasValue() {
    return this.asyncFileMap.size;
  }

  clear() {
    this.asyncFileMap.clear();
  }
}

module.exports = {
  asyncService: new AsyncService()
};
