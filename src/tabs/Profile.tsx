
export default function Profile() {
  return (
    <div>
      
      <h3>KingCosmic</h3>
      <p>@KingCosmic</p>
      <h3>$48,151,623.42</h3>

      {/* Decks */}
      <div class=''>
        {[1, 2, 3].map(_deck => (
          <div>
            <p>Bloodmoon Ursaluna</p>
            <p>$1,256</p>
          </div>
        ))}
      </div>
    </div>
  )
}