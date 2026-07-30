export default function GoldButton({
    children,
    onClick,
    variant = 'primary',
    size = 'medium',
    icon,
    loading = false,
    disabled = false,
    type = 'button',
  }) {
    return (
      <button
        type={type}
        className={`gold-button gold-button--${variant} gold-button--${size}`}
        onClick={onClick}
        disabled={disabled || loading}
      >
        {loading ? (
          <span className="button-spinner" aria-hidden="true" />
        ) : (
          icon && <span className="button-icon">{icon}</span>
        )}
  
        <span>{loading ? 'Please wait' : children}</span>
  
        <span className="button-shine" aria-hidden="true" />
      </button>
    );
  }