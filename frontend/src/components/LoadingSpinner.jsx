const LoadingSpinner = ({ size = 'md' }) => {
    const cls = size === 'lg' ? 'spinner lg' : 'spinner';
    return (
        <div className="spinner-container">
            <div className={cls} aria-label="Loading" />
        </div>
    );
};

export default LoadingSpinner;
