import React from 'react';
import { Result, Button } from 'antd';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error: error?.message || 'Unexpected UI error', errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Result
            status="500"
            title="Something went wrong."
            subTitle={this.state.error ? `The application encountered an unexpected error: ${this.state.error}` : "The application encountered an unexpected error."}
            extra={<Button type="primary" onClick={() => window.location.href = '/'}>Back Home</Button>}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
