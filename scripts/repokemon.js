require('dotenv').config();
const fs = require('fs');
const https = require('https');

const { GH_CLIENT_ID, GH_CLIENT_SECRET } = process.env;

const json = JSON.parse(fs.readFileSync('data/pokemon-list.json'));
const ids = [];
const dupIDs = new Set();
const data = json
  .filter(function (d) {
    // Filter out duplicates
    const id = d.id;
    const included = ids.indexOf(id) >= 0;
    if (included) dupIDs.add(id);
    if (!included) ids.push(id);
    return !included;
  })
  .map(function (d) {
    return {
      // 3 digits for ID, padded with zeros
      // But one day, they have 1K pokemons so it became 4 digits
      // Suddenly d.number returns "0001" instead of "001" but the image is still 001.png
      id: String(d.id).padStart(3, 0),
      name: d.name,
      slug: d.slug,
    };
  });

console.log(`Duplicate IDs in source data`, [...dupIDs]);

let count = 0;
const total = data.length;
console.log('Total pokemons: ' + total);

const done = function () {
  fs.writeFileSync('data/repokemon.json', JSON.stringify(data, null, '\t'));
  fs.writeFileSync('data/last-updated.txt', new Date().toJSON());
};

function formatPokemonName(str) {
  var normalize = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  normalize = normalize.replace(/[^A-zÀ-ú0-9 .\-_:]/gi, '');
  normalize = normalize.toLowerCase();

  return normalize
}


const fetch = function () {
  if (count >= total) return done();

  var d = data[count++];
  var pokemonName = d.name;
  var pokemonSlug = d.slug;
  pokemonName = formatPokemonName(pokemonName)
  pokemonSlug = formatPokemonName(pokemonSlug)


  console.log(count + ' Catching ' + pokemonName + '...');

  https.get(
    `https://api.github.com/search/repositories?per_page=100&q=${encodeURIComponent(
      `${pokemonName} in:name mirror:false fork:false sort:stars`,
    )}`,
    {
      auth: `${GH_CLIENT_ID}:${GH_CLIENT_SECRET}`,
      headers: {
        'User-Agent': 'Repokemon client',
      },
    },
    function (res) {
      var body = '';
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function () {
        var data = JSON.parse(body);
        var items = data.items;
        if (items && items.length) {
          console.log('Found ' + items.length + ' ' + pokemonName + '...');
          items = items.filter(function (item) {
            var repoName = formatPokemonName(item.name)
            return (
              repoName == pokemonName ||
              repoName == pokemonSlug ||
              repoName == pokemonSlug.replace(/_/g, '-') ||
              repoName == pokemonSlug.replace(/_/g, '')
            )
          });

          console.log('Found ' + items.length + ' ' + pokemonName + ' after filter...');

          if (!items.length) {
            setTimeout(fetch, 2000); // 2 seconds interval
            return;
          }

          var item = items.sort(function (a, b) {
            return b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at)
          })[0];

          d.repo = {
            id: item.id,
            name: item.name,
            full_name: item.full_name,
            owner_name: item.owner.login,
            owner_avatar: item.owner.avatar_url,
            url: item.html_url,
            desc: item.description,
            lang: item.language,
            stars: item.stargazers_count,
            watches: item.watchers_count,
            forks: item.forks_count,
          };
        } else {
          console.log('Found 0 ' + pokemonName + ', sorry.');

          if (data.message) {
            console.log('message: ', data.message);
          }
        }

        setTimeout(fetch, 2000); // 2 seconds interval
      });
    },
  );
};

console.log(`Estimated catching time: ${Math.ceil(total / 30)} minute(s)`);
fetch();
