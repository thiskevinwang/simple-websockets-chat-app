import {
  ApiGatewayManagementApi,
  ApiGatewayManagementApiServiceException,
  GoneException,
} from "@aws-sdk/client-apigatewaymanagementapi";
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
      }),
    );
  } catch (e: any) {
    return { statusCode: 500, body: e.stack };
  }

  const apigwManagementApi = new ApiGatewayManagementApi({
    apiVersion: "2018-11-29",
    endpoint:
      event.requestContext.domainName + "/" + event.requestContext.stage,
  });

  const postData = JSON.parse(event.body!).data;

  const postCalls = connectionData.Items?.map(async ({ connectionId }) => {
    try {
      await apigwManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: postData,
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
