'use strict';
const AWS = require('aws-sdk');

module.exports.createMessage = async (event) => {
  for (const message of event.Records) {
    // Process each SQS message here
    const body = JSON.parse(message.body)
    const data = JSON.parse(body)

    const {
      CarrierCode,
      FlightNumber,
      DepartureDate,
      DepartureAirport,
      ArrivalAirport,
      DisruptionProvince,
      DisruptionType,
      DisruptionCode,
      DisruptionReason,
    } = data.FlightIdentifier

    const dynamoDb = new AWS.DynamoDB.DocumentClient();
    const primaryKey = `${CarrierCode}#${FlightNumber}#${DepartureDate}#${DepartureAirport}`;
    const putParams = {
      TableName: process.env.DYNAMODB_MESAGE_TABLE,
      Item: {
        primary_key: primaryKey,
        CarrierCode,
        FlightNumber,
        DepartureDate,
        DepartureAirport,
        ArrivalAirport,
        DisruptionProvince,
        DisruptionType,
        DisruptionCode,
        DisruptionReason,
      },
    };
    await dynamoDb.put(putParams).promise();

    return {
      statusCode: 201,
    };
  }
};

// { event: "hotel_booking_accepted",
// ExecutionId: "c6d66370-fe96-4697-8aca-e096295949fa",
// AgentId: "AC101223",
// FlightIdentifier:
//         { CarrierCode: "AC",
//         FlightNumber: "90",
//         DepartureDate: "2022-07-22",
//         DepartureAirport: "GRU",
//         ArrivalAirport: "EZE",
//         DisruptionProvince: "",
//         DisruptionType: "Flight Delay",
//         DisruptionCode: "FD",
//         DisruptionReason: "MOBILITY ISSUES" } }
