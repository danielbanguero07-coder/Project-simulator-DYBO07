import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let sdk: NodeSDK | null = null;

export function setupOpenTelemetry() {
  if (process.env.TRACING_ENABLED === 'false') {
    console.log('📊 OpenTelemetry disabled');
    return;
  }

  try {
    const prometheusExporter = new PrometheusExporter(
      { port: Number(process.env.PROMETHEUS_PORT) || 9464 },
      () => console.log('📊 Prometheus scrape endpoint: http://localhost:9464/metrics'),
    );

    sdk = new NodeSDK({
      serviceName: 'simulation-backend',
      instrumentations: [getNodeAutoInstrumentations()],
      // @ts-ignore - PrometheusExporter implements the MetricReader contract
      metricReader: prometheusExporter as any,
    } as any);

    sdk.start();
    console.log('📊 OpenTelemetry initialized');
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
  }
}

export function shutdownOpenTelemetry() {
  if (sdk) {
    sdk.shutdown().catch(console.error);
  }
}
