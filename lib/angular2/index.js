/**
 * @module Angular 2 Generator for loopback-sdk-builder
 * @author Jonathan Casarrubias <@johncasarrubias> <github:jonathan-casarrubias>
 * @license MTI
 * @description
 * Defines a SDK Schema and builds according configuration
 */
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var rmdir = require('rimraf');
var ejs = require('ejs');
var utils = require('../utils');
/**
 * EJS Q Filter
 */
ejs.filters.q = (obj) => JSON.stringify(obj, null, 2);
/**
 * Generate Client SDK for the given loopback application.
 */
module.exports = function generate(ctx) {
  'use strict';
  // Describe models and remove those blacklisted
  ctx.models = utils.describeModels(ctx.app);
  /**
   * Directory Management
   */
  ctx.outputFolder = path.resolve(ctx.outputFolder);
  console.log('Removing base directory %s', ctx.outputFolder);
  rmdir.sync(ctx.outputFolder);
  // Create required directories
  let directories = [
    ctx.outputFolder,
    ctx.outputFolder + '/models',
    ctx.outputFolder + '/storage',
    ctx.outputFolder + '/services/core',
    ctx.outputFolder + '/services/custom'
  ];
  if (ctx.isIo === 'enabled') directories.push(ctx.outputFolder + '/sockets');
  directories.forEach(directory => mkdirp.sync(directory));
  /**
  * LoopBack SDK Builder Schema for Angular 2 and NativeScript 2
  **/
  let schema = [
    /**
     * SDK INDEXES
     */
    {
      template: './shared/index.ejs',
      output: '/index.ts',
      params: {
        isIo: ctx.isIo,
        models: ctx.models
      }
    },
    {
      template: './shared/models/index.ejs',
      output: '/models/index.ts',
      params: { models: ctx.models }
    },
    {
      template: './shared/services/index.ejs',
      output: '/services/index.ts',
      params: {}
    },
    {
      template: './shared/services/custom/index.ejs',
      output: '/services/custom/index.ts',
      params: { models: ctx.models }
    },
    {
      template: './shared/services/core/index.ejs',
      output: '/services/core/index.ts',
      params: {}
    },
    /**
     * SDK CONFIG
     */
    {
      template: './shared/config.ejs',
      output: '/lb.config.ts',
      params: {}
    },
    /**
     * SDK STATIC BASE AND CORE FILES
     */
    {
      template: './shared/models/base.ejs',
      output: '/models/BaseModels.ts',
      params: { loadAccessToken: (ctx.models.AccessToken ? true : false) }
    },
    {
      template: './shared/services/core/auth.ejs',
      output: '/services/core/auth.service.ts',
      params: {}
    },
    {
      template: './shared/services/core/base.ejs',
      output: '/services/core/base.service.ts',
      params: { isIo: ctx.isIo }
    },
    {
      template: './shared/services/core/error.ejs',
      output: '/services/core/error.service.ts',
      params: {}
    },
    {
      template: './shared/services/core/logger.ejs',
      output: '/services/core/logger.service.ts',
      params: {}
    },
    {
      template: './shared/services/core/search.ejs',
      output: '/services/core/search.params.ts',
      params: {}
    },
    /**
     * STORAGE DRIVER
     */
    {
      template: './drivers/' + ctx.driver + '/storage.driver.ejs',
      output: '/storage/storage.driver.ts',
      params: {}
    }
  ];
  /**
   * PUBSUB MODULE SUPPORT
   */
  if (ctx.isIo === 'enabled') {
    schema = schema.concat([
      {
        template: './drivers/' + ctx.driver + '/socket.driver.ejs',
        output: '/sockets/socket.driver.ts',
        params: {}
      },
      {
        template: './shared/sockets/index.ejs',
        output: '/sockets/index.ts',
        params: {}
      },
      {
        template: './shared/sockets/connections.ejs',
        output: '/sockets/socket.connections.ts',
        params: {}
      }
    ]);
  }
  /**
   * SDK DYNAMIC FILES
   */
  Object.keys(ctx.models).forEach(modelName => {
    if (ctx.models[modelName].sharedClass.ctor.settings.sdk &&
      !ctx.models[modelName].sharedClass.ctor.settings.sdk.enabled) {
      console.warn('LoopBack SDK Builder: %s model was ignored', modelName);
      return;
    } else {
      console.info('LoopBack SDK Builder: adding %s model to SDK', modelName);
      schema = schema.concat([
        /**
        * SDK MODELS
        */
        {
          template: './shared/models/model.ejs',
          output: '/models/' + modelName + '.ts',
          params: {
            model: ctx.models[modelName],
            modelName: modelName,
            buildModelImports: buildModelImports,
            buildModelProperties: buildModelProperties
          }
        },
        /**
        * SDK CUSTOM SERVICES
        */
        {
          template: './shared/services/custom/service.ejs',
          output: '/services/custom/' + modelName + '.ts',
          params: {
            isIo: ctx.isIo,
            model: ctx.models[modelName],
            modelName: modelName,
            moduleName: ctx.moduleName,
            buildPostBody: buildPostBody,
            buildUrlParams: buildUrlParams,
            buildRouteParams: buildRouteParams,
            buildMethodParams: buildMethodParams,
            buildServiceImports: buildServiceImports,
            normalizeMethodName: normalizeMethodName
          }
        }
      ]);
    }
  });
  /**
   * PROCESS SCHEMA
   */
  schema.forEach(
    config => {
      console.info('Generating: %s', `${ctx.outputFolder}${config.output}`);
      fs.writeFileSync(
        `${ctx.outputFolder}${config.output}`,
        ejs.render(fs.readFileSync(
          require.resolve(config.template),
          { encoding: 'utf-8' }),
          config.params
        )
      )
    }
  );
  /**
   * @method buildModelImports
   * @description
   * Define import statement for those model who are related to other scopes
   */
  function buildModelImports(model) {
    let relations = Object.keys(model.sharedClass.ctor.relations).filter(
      relationName => model.sharedClass.ctor.relations[relationName].targetClass &&
        model.sharedClass.ctor.relations[relationName].targetClass !== model.name
    );
    let loaded = {};
    let output = [];
    if (relations.length > 0) {
      output.push('import {');
      relations.forEach((relationName, i) => {
        let targetClass = model.sharedClass.ctor.relations[relationName].targetClass;
        if (!loaded[targetClass]) {
          loaded[targetClass] = true;
          output.push(`  ${targetClass}${(i < relations.length - 1) ? ',' : ''}`);
        }
      });
      output.push('} from \'../index\';\n');
    }
    return output.join('\n');
  }
  /**
   * @method buildModelProperties
   * @description
   * Define properties for the given model
   */
  function buildModelProperties(model, isInterface) {
    let output = [];
    // Add Model Properties
    Object.keys(model.properties).forEach((property) => {
      if (model.isUser && property === 'credentials') return;
      let meta = model.properties[property];
      let isRequired = '';
      if (isInterface && meta.required)
        isRequired = '?';
      output.push(`  ${property}${isRequired}: ${buildPropertyType(meta.type)};`);
    });
    // Add Model Relations
    Object.keys(model.sharedClass.ctor.relations).forEach(relation => {
      output.push(`  ${relation}${isInterface ? '?' : ''}: ${buildRelationType(model, relation)};`);
    });
    return output.join('\n');
  }
  /**
   * @method buildRelationType
   * @description
   * Discovers property type according related models that are public
   */
  function buildRelationType(model, relationName) {
    let relation = model.sharedClass.ctor.relations[relationName];
    let targetClass = relation.targetClass;
    let basicType = (ctx.models[targetClass]) ? targetClass : 'any';
    let finalType = relation.type.match(/(hasOne|belongsTo)/g)
      ? basicType : `Array<${basicType}>`;
    return finalType;
  }
  /**
   * @method buildServiceImports
   * @description
   * Define import statement for those model who are related to other scopes
   */
  function buildServiceImports(modelName, methods) {
    let output = [`  ${modelName}`];
    let namespaces = {}; namespaces[modelName] = true;
    methods.forEach((action) => {
      action.accepts.forEach((param, i, arr) => {
        var type;
        if (param.type === 'object') {
          type = param.arg === 'filter' ? 'LoopBackFilter' : 'any';
        } else {
          type = param.type !== 'AccessToken' && param.type !== 'any'
            ? param.type : 'any';
        }
        let capitalized = capitalize(type);
        if (typeof type === 'string' && !type.match(/(any|number|boolean|string|date|array|object)/) && !namespaces[capitalized]) {
          namespaces[capitalized] = true;
          output.push(`  ${capitalized}`);
        }
      });
    });
    return output.join(',\n');
  }
  /**
   * @method normalizeMethodName
   * @description
   * Normalizes method name from loopback form to a more human readable form
   */
  function normalizeMethodName(methodName, capitalize) {
    return methodName.split('__').map((value, index) => {
      return (index < 2 && !capitalize) ? value : (value.charAt(0).toUpperCase() + value.slice(1));
    }).join('');
  }
  /**
   * @method buildMethodParams
   * @description
   * Set which params should be defined for the given remote method
   */
  function buildMethodParams(methodName, params) {
    let output = new Array();
    if (methodName !== 'logout') {
      params.forEach((param, i, arr) => {
        let type;
        if (param.type === 'object') {
          type = param.arg === 'filter' ? 'LoopBackFilter' : 'any';
        } else {
          type = param.type !== 'AccessToken' && param.type !== 'any'
            ? capitalize(param.type) : 'any';
        }
        let value = '';
        if (!param.required && methodName === 'login' && param.arg === 'include') {
          type  = 'any';
          value = " = 'user'";
        } else {
          value = !param.required ? ' = undefined' : '';
        }
        output.push(`${param.arg}: ${type}${value}`);
      });
    }
    return output.join(', ');
  }
  /**
   * @method buildPostBody
   * @description
   * Define which properties should be passed while posting data (POST, PUT, PATCH)
   */
  function buildPostBody(postData) {
    let output = [];
    if (postData && postData.length > 0) {
      output.push('');
      let l = postData.length;
      postData.forEach((property, i) => {
        output.push(`      ${property.arg}: ${property.arg}${(i < l - 1) ? ',' : ''}`);
      });
      output.push('    ');
    }
    return output.join('\n');
  }
  /**
   * @method buildUrlParams
   * @description
   * Define which properties should be passed using query string
   */
  function buildUrlParams(model, methodName, urlParams) {
    let output = [''];
    // filter params that should not go over url query string
    urlParams = urlParams.filter(param => !param.arg.match(/(id|fk|data|options|credentials)/g));
    if (model.isUser && methodName === 'logout')
      output.push(`       urlParams.access_token = this.auth.getAccessTokenId();`);
    if (urlParams && urlParams.length > 0) {
      urlParams.forEach((param, i) => {
        output.push(`    if (${param.arg}) urlParams.${param.arg} = ${param.arg};`);
      });
    }
    return output.join('\n');
  }
  /**
   * @method buildRouteParams
   * @description
   * Define which properties should be passed as route params
   */
  function buildRouteParams(routeParams) {
    let output = [];
    if (routeParams && routeParams.length > 0) {
      output.push('');
      routeParams.forEach((param, i) => {
        output.push(`      ${param.arg}: ${param.arg}${(i < routeParams.length - 1) ? ',' : ''}`);
      });
      output.push('    ');
    }
    return output.join('\n');
  }
  /**
   * @author João Ribeiro <jonnybgod@gmail.com, http://jonnybgod.ghost.io>,
   * @license MTI
   * @method buildPropertyType
   * @description
   * Define which properties should be passed as route params
   */
  function buildPropertyType(type) {
    switch (type.toString()) {
      case 'boolean':
      case 'function Boolean() { [native code] }':
        return 'boolean';
      case 'number':
      case 'function Number() { [native code] }':
        return 'number';
      case 'Array':
      case 'Array':
        return 'Array<any>';
      case 'string':
      case 'function String() { [native code] }':
        return 'string';
      default:
        return 'any';
    }
  }
};

function capitalize(string) {
  return string[0].toUpperCase() + string.slice(1);
}