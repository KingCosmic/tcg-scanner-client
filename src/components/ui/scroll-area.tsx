interface ScrollAreaProps {
  children: React.ReactNode
  className?: string
}

const ScrollArea = ({ children, className }: ScrollAreaProps) => {
  return (
    <div className={`max-h-[300px] overflow-y-auto border border-gray-300 rounded-md ${className}`} style={{ maxHeight: '300px' }}>
      {children}
    </div>
  )
}

export default ScrollArea
