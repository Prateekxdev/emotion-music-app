from ytmusicapi import YTMusic

ytmusic = YTMusic('browser.json')
results = ytmusic.search("happy upbeat songs", filter="songs")

for song in results[:5]:
    print(song['title'], "-", song['artists'][0]['name'])
    