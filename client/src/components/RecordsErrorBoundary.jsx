import { Component } from 'react';
import { Link } from 'react-router';

/** Catches render-time crashes on any of the 4 swim-records pages — a
 * malformed/changed response shape from api.ctkeane.com (a black box
 * outside this repo's control), or a failed lazy-chunk load on the Export
 * route. useRecords' loading/success/error states only cover fetch-time
 * failures, not render-time exceptions, so this is the other half of
 * "all 4 pages degrade consistently" (docs/designs/swim-records-integration.md,
 * Eng Review Additions #5, widened during the design review). */
export class RecordsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Records page crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="records-page">
          <div className="banner banner--error">
            Something went wrong loading this page.{' '}
            <Link to="/records">Back to Team Records</Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
