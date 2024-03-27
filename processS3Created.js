const AWS = require("aws-sdk");

const s3 = new AWS.S3();

module.exports.processS3 = async (event) => {
  for (const record of event.Records) {
    const srcBucket = record.s3.bucket.name;
    const srcKey = decodeURIComponent(record.s3.object.key);
    console.log("hehehe=>>", srcBucket, srcKey);

    // Download the JSON file from the source bucket
    const params = {
      Bucket: srcBucket,
      Key: srcKey,
    };
    const data = await s3.getObject(params).promise();
    const jsonData = JSON.parse(data.Body.toString("utf-8"));
    console.log("data ne ====>>", jsonData);

    const records = jsonData.Records;
    const partitionKeys = [];

    const recordsWithPk = {};

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const body = JSON.parse(record.body);

      const { CarrierCode, FlightNumber, DepartureDate, DepartureAirport } =
        body.FlightIdentifier;

      const PartitionKey = `${CarrierCode}#${FlightNumber}#${DepartureDate}#${DepartureAirport}`;
      partitionKeys.push(PartitionKey);
      recordsWithPk[PartitionKey] = record;
    }

    const dynamoDb = new AWS.DynamoDB();
    const tableName = process.env.DYNAMODB_MESAGE_TABLE;

    const keysToQuery = partitionKeys.map((x) => ({
      primary_key: { S: x },
    }));

    const batchGetParams = {
      RequestItems: {
        [tableName]: {
          Keys: keysToQuery,
        },
      },
    };

    let successedRecords = [];
    let unsuccessedRecords = [];
    try {
      const data = await dynamoDb.batchGetItem(batchGetParams).promise();
      const pks = data.Responses[tableName].map((x) => x.primary_key.S);
      successedRecords = pks.map((x) => recordsWithPk[x]);
      unsuccessedRecords = partitionKeys
        .filter((x) => !pks.includes(x))
        .map((x) => recordsWithPk[x]);
    } catch (err) {
      console.log("batch get error ==>", err);
      unsuccessedRecords = partitionKeys.map((x) => recordsWithPk[x]);
    }

    console.log("partitionKeysToDelete=>>", keysToQuery);
    const dbParams = {
      RequestItems: {
        [tableName]: keysToQuery.map((item) => ({
          DeleteRequest: { Key: item },
        })),
      },
    };

    try {
      await dynamoDb.batchWriteItem(dbParams).promise();
    } catch (error) {
      console.log("batch write error ==>", error);
      unsuccessedRecords = partitionKeys.map((x) => recordsWithPk[x]);
    }

    // // Upload the processed data to another folder within the same bucket
    const file = srcKey.split("/").pop();
    const type = file.split(".").pop();
    const fileName = file.replace(
      `.${type}`,
      `_${new Date().getTime()}`
    );
    const newFileName = `${fileName}.${type}`;

    if (successedRecords.length) {
      const destKey = `Processed/${newFileName}`;
      const processedData = JSON.stringify({ Records: successedRecords });
      console.log(destKey);
      const archivedDestKey = `Archived/${newFileName}`;
      await Promise.all([
        uploadToS3(srcBucket, destKey, processedData),
        uploadToS3(srcBucket, archivedDestKey, JSON.stringify(jsonData)),
      ]);
    }

    if (unsuccessedRecords.length) {
      const destKey = `UnProcessed/${newFileName}`;
      const processedData = JSON.stringify({ Records: unsuccessedRecords });
      console.log(destKey);
      const errorDestKey = `Error/${newFileName}`;
      await Promise.all([
        uploadToS3(srcBucket, destKey, processedData),
        uploadToS3(srcBucket, errorDestKey, JSON.stringify(jsonData)),
      ]);
    }
  }
};

const uploadToS3 = async (srcBucket, destKey, processedData) => {
  const destParams = {
    Bucket: srcBucket,
    Key: destKey,
    Body: processedData,
    ContentType: "application/json",
  };
  await s3.putObject(destParams).promise();

  console.log(`Processed data saved to: ${destKey}`);
};
