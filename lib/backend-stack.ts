import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apiGW from 'aws-cdk-lib/aws-apigatewayv2';
import * as apiGWIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const sessionBucket = new s3.Bucket(this, 'sessionBucket');

    const createSession = new lambda.Function(this, 'createSession', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'createSession.main',
      environment: {
        BUCKET_NAME: sessionBucket.bucketName,
      },
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const getSession = new lambda.Function(this, 'getSession', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'getSession.main',
      environment: {
        BUCKET_NAME: sessionBucket.bucketName,
      },
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const createSessionIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'createSessionIntegration',
      createSession
    );

    const getSessionIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'getSessionIntegration',
      getSession
    );

    const httpApi = new apiGW.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowHeaders: ['Authorization'],
        allowMethods: [apiGW.CorsHttpMethod.POST, apiGW.CorsHttpMethod.GET],
        allowOrigins: ['*'],
      },
    });

    httpApi.addRoutes({
      path: '/sessions',
      methods: [apiGW.HttpMethod.POST],
      integration: createSessionIntegration,
    });

    httpApi.addRoutes({
      path: '/sessions/{id}',
      methods: [apiGW.HttpMethod.GET],
      integration: getSessionIntegration,
    });

    sessionBucket.grantWrite(createSession);
    sessionBucket.grantRead(getSession);

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: httpApi.apiEndpoint,
      description: 'The URL of the API Gateway',
    });
  }
}
