import _ from 'lodash'
import logRaw from 'electron-log'

export default class Import {
  constructor(fileName, options, connection, table) {
    const log = logRaw.scope('import-file')
    this.fileName = fileName
    this.options = options
    this.connection = connection
    this.table = table
    this.logger = () => log

    this.importScriptOptions = {
      executeOptions: { multiple: false }
    }
  }

  setOptions(opt) {
    this.options = opt
    this.table = opt.table
    this.importScriptOptions.userImportOptions = opt
  }
  
  async importFile() {
    return await this.connection.importFile()
  }

  /**
   * 
   * @param {Object[]} dataMap an array of file header -> column name (tabulator getData())
   * @param dataMap.fileColumn
   * @param dataMap.tableColumn
   * @returns {Object[]} a filtered array of file header and columns names minus any ignores or empty strings
   */
  mapper (dataMap) {
    return dataMap
      .filter(t => t.tableColumn !== '' && t.tableColumn.toUpperCase().trim() !== 'IGNORE')
      .map(({fileColumn, tableColumn}) => {
        return {
          fileColumn,
          tableColumn
        }
      })
  }

  /**
   * 
   * @param {Object[]} rawData an array of file header -> column name (tabulator getData())
   * @param rawData.fileColumn
   * @param rawData.tableColumn
   * @returns {Object} mapped data array and columns object
   */
  mapRawData (rawData) {
    const data = rawData.data.map(d => {
      for(const key in d) {
        let importedValue = null
        importedValue = this.options.trimWhitespaces && _.isString(d[key]) ? d[key].trim() : d[key]
        if (_.isString(d[key]) && this.options.nullableValues.includes(importedValue.toUpperCase().trim())) {
          importedValue = null
        }
        d[key] = importedValue
      }
      return d
    })

    const columns = rawData.meta.fields.map(field => ({
      title: field,
      field
    }))

    return {
      columns,
      data
    }
  }

  /**
   * 
   * @param {Object[]} data a JSON object of the data to be mapped
   * @returns {Object[]} An array of objects of the data
   */
  mapData (data) {
    return data.map(d =>
      this.options.importMap.reduce((acc, m) => {
        const columnData = d[m.fileColumn]
        let importedValue = null

        if (columnData != null) {
          if (this.options.trimWhitespaces && _.isString(columnData)) {
            importedValue = columnData.trim()
          } else if (_.isString(columnData)) {
            importedValue = columnData
          } else {
            importedValue = columnData
          }

          if (this.options.nullableValues.includes(importedValue.toString().toUpperCase().trim())) {
            importedValue = null
          }
        }
        acc[m.tableColumn] = importedValue
        return acc
      }, {})
    )
  }

  /**
   * Take the data to be put into the table and format it for the insertQueryBuilder function in client
   * @param {String[]} data the raw data to be mapped when ready to write to the databse
   * @returns {Object[]} An array of objeccts containing
   * - `data` {Array} 
   * - `table` {String}
   * - `schema` {String|null}
   */
  buildDataObj (data) {
    return this
      .mapData(data)
      .filter(v => v != null && v !== '')
      .map(d => ({
        data: [d],
        table: this.table.name,
        schema: this.table.schema || null 
      }))
  }

  allowChangeSettings() {
    return false
  }

  getImporterOptions(opt) {
    return opt
  }

  async read() {
    throw new Error("Method 'read()' must be implemented.")
  }

  async getPreview() {
    throw new Error("Method 'getPreview()' must be implemented.")
  }

  autodetectedSettings() {
    return {
      columnDelimeter: false,
      quoteCharacter: false,
      escapeCharacter: false,
      newlineCharacter: false
    }
  }

  validateFile() {
    throw new Error("Method 'validateFile()' must be implemented")
  }

  async getSheets() {
    throw new Error("Method 'getSheets()' must be implemented but is Excel only")
  }
}