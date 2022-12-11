import { ApiGatewayManagementApi } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";

import type { APIGatewayEvent } from "aws-lambda";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const { TABLE_NAME } = process.env;

export const handler = async (event: APIGatewayEvent) => {
  let connectionData: ScanCommandOutput | null = null;

  try {
    connectionData = await ddbDocClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: "connectionId",
        // filter out items whose TTL has expired
        FilterExpression: "#TTL > :now",
        ExpressionAttributeValues: {
          ":now": Math.floor(Date.now() / 1000),
        },
        ExpressionAttributeNames: {
          "#TTL": "TTL",
        },
      }),
    );
  } catch (e: any) {
    return { statusCode: 500, body: e.stack };
  }

  const apigwManagementApi = new ApiGatewayManagementApi({
    apiVersion: "2018-11-29",
    endpoint:
      "https://" +
      event.requestContext.domainName +
      "/" +
      event.requestContext.stage,
  });

  const postData: string = JSON.parse(event.body!).data;

  const postCalls = connectionData.Items?.map(async ({ connectionId }) => {
    try {
      await apigwManagementApi.postToConnection({
        ConnectionId: connectionId,
        // @ts-expect-error - string works here
        Data: postData,
        // Data: str2ab(postData),
      });
    } catch (e: any) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddbDocClient.send(
          new DeleteCommand({ TableName: TABLE_NAME, Key: { connectionId } }),
        );
      } else {
        throw e;
      }
    }
  });

  try {
    await Promise.all(postCalls!);
  } catch (e: any) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: "Data sent." };
};

// function str2ab(str: string) {
//   var buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
//   var bufView = new Uint8Array(buf);
//   for (var i = 0, strLen = str.length; i < strLen; i++) {
//     bufView[i] = str.charCodeAt(i);
//   }
//   return bufView;
// }
