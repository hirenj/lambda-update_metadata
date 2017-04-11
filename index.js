'use strict';
/*jshint esversion: 6, node:true */

const metadataConverter = require('node-uberon-mappings');

let data_table = 'test-data';

let config = {};

try {
    config = require('./resources.conf.json');
    data_table = config.tables.data;
} catch (e) {
}

const AWS = require('lambda-helpers').AWS;

if (config.region) {
  require('lambda-helpers').AWS.setRegion(config.region);
}

const dynamo = new AWS.DynamoDB.DocumentClient();

const update_metadata = function(metadata) {
  if (! metadata || ! metadata.sample) {
    return Promise.resolve(metadata);
  }
  if (metadata.sample.tissue) {
    return metadataConverter.convert( metadata.sample.tissue ).then( converted => {
      if ( ! converted.root ) {
        return;
      }
      metadata.sample.uberon = converted.root;
      metadata.sample.description = converted.name;
      return metadata;
    });
  }
  return Promise.resolve(metadata);
};

const upload_metadata_dynamodb = function upload_metadata_dynamodb(set_id,metadata) {
  console.log('Derived metadata to be',set_id,metadata);
  if ( ! metadata ) {
    return Promise.resolve({ dataset: set_id, metadata: {} });
  }
  if (metadata.sample) {
    console.log('Mapping to super-tissue',metadata.sample.tissue,'to',metadata.sample.description);
  }
  let params = {
   'TableName' : data_table,
   'Key' : {'acc' : 'metadata', 'dataset' : set_id },
   'UpdateExpression': 'SET #metadata = :metadata',
    'ExpressionAttributeValues': {
        ':metadata' : metadata
    },
    'ExpressionAttributeNames' : {
      '#metadata' : 'metadata'
    }
  };
  return dynamo.update(params).promise().then( () => {
    return { dataset: set_id, metadata : { sample: metadata.sample, mimetype: metadata.mimetype, title: metadata.title, quantitation: metadata.quantitation } };
  });
};

const download_metadata_dynamodb = function download_metadata_dynamodb(set_id) {
  let params = {
    TableName: data_table,
    Key: {'acc' : 'metadata', 'dataset' : set_id }
  };
  return dynamo.get(params).promise().then( item => item.Item.metadata );
};

const perform_update = function(set_id) {
  return download_metadata_dynamodb(set_id).then( metadata => {
    return update_metadata(metadata);
  }).then( metadata => upload_metadata_dynamodb(set_id,metadata));
};

const updateMetadata = function(event,context) {
  let dataset_path = event.Key;
  console.log(`Updating metadata for event triggered by ${dataset_path}`);
  let dataset = dataset_path.split('/')[1];
  perform_update(dataset)
  .then( (updated) => context.succeed( Object.assign(event,{ metadata: updated.metadata }) ))
  .catch( err => context.fail(err) );
};

exports.updateMetadata = updateMetadata;
