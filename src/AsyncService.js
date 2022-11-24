class AsyncService {
  constructor() {
    this.asyncFileMap = new Map();
  }

  setFileMap(subpackageName, file) {
    const fileSet = this.getFileMapByName(subpackageName);
    if (!fileSet.has(file)) {
      fileSet.add(file);
    }
  }

  getFileMapByName(subpackageName) {
    if (!this.asyncFileMap.has(subpackageName)) {
      this.asyncFileMap.set(subpackageName, new Set());
    }
    return this.asyncFileMap.get(subpackageName);
  }

  getNextFile() {
    if (this.asyncFileMap.size) {
      for (const [key, fileSet] of this.asyncFileMap.entries()) {
        if (fileSet.size) {
          for (const file of fileSet) {
            fileSet.delete(file);
            return {key, file};
          }
        }
      }
    }
    return '';
  }

  clear() {
    this.asyncFileMap.clear();
  }
}

module.exports = {
  asyncService: new AsyncService()
};
