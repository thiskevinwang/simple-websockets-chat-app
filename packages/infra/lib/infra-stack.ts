// @experimental
// https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2-readme.html
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
// https://docs.aws.amazon.com/cdk/api/v2/docs/@aws-cdk_aws-apigatewayv2-alpha.WebSocketApi.html
import { WebSocketLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as cdk from "aws-cdk-lib";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import type { NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**************************************
     * DynamoDB
     **************************************/
    const table = new ddb.Table(this, "wsapi-table", {
      partitionKey: {
        name: "connectionId",
        type: ddb.AttributeType.STRING,
      },
      // Note: API Gateway websocket connections stay alive for 2 hours
      // and have an idle timeout of 10 minutes.
      // - https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html
      timeToLiveAttribute: "TTL",
    });

    /**************************************
     * Lambda
     **************************************/
    const sharedLambdaProps: Partial<NodejsFunctionProps> = {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
      handler: "handler",
      bundling: { target: "es2020" },
    };

    // Create 3 lambdas with dynamo permissions
    const onconnect = new nodeLambda.NodejsFunction(this, "onconnect", {
      entry: "../onconnect/app.ts",
      ...sharedLambdaProps,
    });
    table.grantReadWriteData(onconnect);

    const ondisconnect = new nodeLambda.NodejsFunction(this, "ondisconnect", {
      entry: "../ondisconnect/app.ts",
      ...sharedLambdaProps,
    });
    table.grantReadWriteData(ondisconnect);

    const sendmessage = new nodeLambda.NodejsFunction(this, "onmessage", {
      entry: "../sendmessage/app.ts",
      ...sharedLambdaProps,
    });
    table.grantReadWriteData(sendmessage);

    /**************************************
     * API Gateway
     **************************************/
    // Create api
    const webSocketApi = new apigwv2.WebSocketApi(this, "wsapi", {
      routeSelectionExpression: "$request.body.action",
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "OnConnectIntegration",
          onconnect,
        ),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "OnDisconnectIntegration",
          ondisconnect,
        ),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "OnMessageIntegration",
          sendmessage,
        ),
      },
    });

    // Deploy it to a stage
    const stage = new apigwv2.WebSocketStage(this, "mystage", {
      webSocketApi,
      stageName: "dev",
      autoDeploy: true,
    });

    // To make calls to your connected clients, your application needs a new permission: “execute-api:ManageConnections”.
    webSocketApi.grantManageConnections(sendmessage);

    // Output the endpoint
    new cdk.CfnOutput(this, "wsapiEndpoint", {
      value: stage.url,
    });
  }
}
