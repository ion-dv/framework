/**
 * Created by akumidv on 24.08.2016.
 * Конвертор импорта портала в файлы импорта платформы
 * Если не нужно сохранение в режиме отладки, нужно задать переменную окружения IMPORT = DONTSAVE
 */

// Уточняем параметры jsHint.
// maxcomplexity - цикломатическая сложность функций разбора по типам 12, а не 10ть из-за архитектуры и упрощения чтения
// jshint maxcomplexity: 12

'use strict';

var fs = require('fs');
var path = require('path');

const getMetaData = require('lib/convert-import-util').getMetaClassFiles;
const saveImportedFiles = require('lib/convert-import-util').saveImportedFiles;
const importReference = require('lib/convert-import-util').importReference;
const getBeforeReference = require('lib/convert-import-util').getBeforeReference;

let appPath = getAppDir();
console.log('Импортируемые приложения', appPath.toString());

Promise.all(appPath.map(importApplications))
  .then((res) => {
    console.info('Выполнен импорт', res);
  })
  .catch((err)=> {
    console.error(err);
  });

/**
 * Функция возвращающая полученное значение, для замены нереализованные в конвертации функций
 * @param {*} res
 * @returns {*}
 */
function empty(res) {
  return res;
}

function importApplications(appPathItem) {
  return new Promise(function (resolve, reject) {
    const importedBeforeReference = require(path.join(appPathItem, 'convert-import-app')).importedBeforeReference || {};
    const importedAfterReference = require(path.join(appPathItem, 'convert-import-app')).importedAfterReference || {};
    /** Параметры importOptions
      saveAll - Сохранять все объекты сразу, а не каждую итерацию и соответственно не очищать
      skipClassName - пропускаемы в итерационном сохранении классы - сохраняются только по итогу импорта (занимают память)
      zip - архивировать выдачу
      zipIgnore: /(declaration@khv-childzem)/ - regexp значение игнрируемых для архивирования файлов - сохранять их как есть (нужно например для пост обработки)
    */
    const importOptions = require(path.join(appPathItem, 'convert-import-app')).options || {};
    let importedFolders = require(path.join(appPathItem, 'convert-import-app')).importedFolders || [];
    importedFolders = typeof importedFolders === 'string' ? [importedFolders] : importedFolders;
    const getImportedFiles = require(path.join(appPathItem, 'convert-import-app')).getImportedFiles || empty;
    const convertImportedFiles = require(path.join(appPathItem, 'convert-import-app')).convertImportedFiles || empty;
    const postImportProcessing = require(path.join(appPathItem, 'convert-import-app')).postImportProcessing || empty;
    const afterSaveProcessing = require(path.join(appPathItem, 'convert-import-app')).afterSaveProcessing || empty;

    console.info('Импортируемые папки', importedFolders.toString());

    const pathToData = path.join(appPathItem, 'data');
    if (!fs.existsSync(pathToData)) {
      fs.mkdirSync(pathToData);
    }
    const pathToMeta = path.join(appPathItem, 'meta');
    getMetaData(pathToMeta)
      .then(
        /**
         * Функция формирования importedData
         * @param {Object}res - классы метаданных приложения
         * @returns {Object} importedData - объект с данными импорта
         * @returns {Object} importedData.meta - структура метаданных, наименование объекта - класс с неймспейсом: adminTerritory@khv-svyaz-info
         * @returns {Object} importedData.parsed - объект с импортируемыми данными, где имена свойств имена исходных файлов
         * @returns {Object} importedData.path - путь к папкам импортируемых данных
         * @returns {Object} importedData.pathData - путь к папке сохранения результатов импорта
         * @returns {Object} importedData.verify - объект с ключевыми данными верификации уникальности и связи объектов
         * @returns {Object} importedData.reference - обюъект с массивами объектов справочников в формате JSON, где имя свойства - имя класса с неймспоейсом: adminTerritory@khv-svyaz-info
         * @returns {Object} importedData.result  - именованный массивом объектов - имя с названием класса, значения - массив данных импорта
         */
        function (res) {
          console.info('Считали мету, импортируем данные приложения', appPathItem);
          let importedData = {meta: res, parsed: {}, verify: {},
            result: {}, pathData: pathToData, config: importOptions};  // Сформировали объект импорта
          if (importedBeforeReference) {
            importedData.reference = importedBeforeReference;
          }
          return importedData;
        })
      .then(getBeforeReference)
      .then((importedData) => {
        /**
         * Импорт и сохранение партии данных из пути импортируемой базы
         * @param {String} importPath импортируемый путь
         * @param {Function} callback
         */
        function importAppBase(importPath, callback) {
          let importedPath = path.join(appPathItem, importPath);
          importedData.path = importedPath;
          getImportedFiles(importedData, importedPath)
            .then(convertImportedFiles) // Конвертируем распарсенные объекты из папки importedPath
            .then((importedData) => {
              delete importedData.parsed; // Очищаем память от уже сконвертированных данных
              importedData.path = '';
              return importedData;
            })
            .then((res) => {
              if (!importOptions.saveAll) { // Не сохранять каждую итерации и соответственно не очищать результаты импорта
                return saveImportedFiles(res, importOptions.skipClassName);
              } else {
                return 0;
              }
            })
            .then((res) => {
              if (!importOptions.saveAll) {
                console.info('Сохранили и очистили память после импорта папки', importedPath);
              } else {
                console.info('Не сохраняли очередную итерацию, память не очищена', importedPath);
              }
              callback(null, res);
            })
            .catch((err)=> {
              callback(err);
            });
        }

        /**
         * Итератор импорта
         * @param {Array} importedFolders - список импортируемых дирректорий
         * @param {Number} i
         * @param {Function} callback
         */
        function importIterator(importedFolders, i, callback) {
          if (i === importedFolders.length) {
            callback (null);
          } else {
            console.info('Импортируем', importedFolders[i]);
            importAppBase(importedFolders[i], (err, res) => {
              console.info('Закончили импорт %s', importedFolders[i]);
              if (err) {
                callback (err);
              } else {
                i++;
                importIterator(importedFolders, i, callback);
              }
            });
          }
        }
        return new Promise(function (resolve,reject) {
          importIterator(importedFolders, 0, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve (importedData);
            }
          });
        });
      })
      .then((importedData) => { // Добавляем справочники, которые были не нужны для импорта
        for (let key in importedAfterReference) {
          if (importedAfterReference.hasOwnProperty(key)) {
            if (!importedData.reference[key]) {
              importedData.reference[key] = [];
            }
            importedData.reference[key] = importedData.reference[key].concat(importedAfterReference[key]);
          }
        }
        return importedData;
      })
      .then(postImportProcessing) // Переводим справочники для сохранения
      .then(importReference) // Переводим справочники для сохранения
      .then((importedData) => {
        delete importedData.reference; // Может бесполезно их уже удалять
        return importedData;
      })
      .then(saveImportedFiles)
      .then(afterSaveProcessing) // Обработка после сохранения (чаще всего самих сохраненных объектов, например проставление единого автоинкремента для объединенной базы)
      .then((res) => {
        resolve(appPathItem);
      })
      .catch((err)=> {
        reject(err);
      });

  });
}

// Получение списка приложений
function getAppDir() {
  try {
    let apps = path.join(__dirname, '..', 'applications');
    fs.accessSync(apps, fs.constants.F_OK);
    let files = fs.readdirSync(apps);
    let appsPath = [];
    for (let i = 0; i < files.length; i++) {
      let fn = path.join(apps, files[i]);
      let stat = fs.lstatSync(fn);
      if (stat.isDirectory()) {
        try {
          fs.accessSync(path.join(fn, 'convert-import-app.js'), fs.constants.F_OK);
          appsPath.push(fn);
        } catch (e) {
          console.info('Отсутствует файл конвертации, пропущено конвертация и иимпорт приложения', fn);
        }

      }
    }
    return appsPath;
  } catch (e) {
    console.warn('Отсутствует дирректория приложений applications');
  }
}