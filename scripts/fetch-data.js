#!/usr/bin/env node
/**
 *
 * fetch-data.js
 *
 * Example usage:
 *      ./fetch-data.js --genome_id=83332.12
 *
 *      ./fetch-data.js --genome_id=520456.3
 *
 *
 * Author(s):
 *      nconrad
*/

const fs = require('fs'),
    path = require('path'),
    process = require('process'),
    opts = require('commander'),
    rp = require('request-promise');

const utils = require('./utils');
const config = require('../config.json');


const getOpts = {
    json: true,
    headers: {
      "content-type": "application/json",
      "authorization": opts.token || ''
    }
}


const tmplData = {
    meta: null,
    annotationData: null
}


if (require.main === module){
    opts.option('-g, --genome_id [value]', 'Genome ID to fetch data for.')
        .parse(process.argv)

    if (!opts.genome_id) {
        console.error("\nMust provide a genome ID.\n");
        process.exit(1);
    }

    let genomeID = opts.genome_id;

    getAllData(genomeID);
}


// # contigs, genome length, gc, n50, L50, genome coverage
async function getAllData(genomeID) {

    // fetch all data
    let meta = await getGenomeQC(genomeID);
    let annotationMeta = await getAnnotationMeta(genomeID);
    let wiki = await getWiki(meta[0].species, meta[0].genus);
    console.log('wiki', wiki)

    // build master data json
    tmplData.meta = meta[0];
    tmplData.annotationMeta = annotationMeta;
    tmplData.wiki = wiki;

    // create genome folder if needed
    utils.createGenomeDir(genomeID);

    // write output
    let outPath = path.resolve(`../${config.reportDir}/${genomeID}/${genomeID}-data.json`);
    console.log(`writing ${outPath}...`);
    let jsonStr = JSON.stringify(tmplData, null, 4);
    await utils.writeFile(outPath, jsonStr);

    console.log(`Done.`);
    process.exit();
}


async function getWiki(species, genus) {
    let url = `${config.wikiUrl}?action=query&prop=extracts` +
        `&exintro=&format=json&formatversion=2&titles=`;

    let speciesQuery = url + species;
    console.log(`Attempting to query species on wiki...`)
    let speciesText = await rp.get(speciesQuery, getOpts).then(res => {
        let extract = res.query.pages[0].extract;
        return extract;
    }).catch((e) => {
        console.error(e.message);
    })

    // if description found, get image, return
    if (speciesText.length != 0) {
        let imageSource = await getWikiImage(species);
        return {text: speciesText, imageSource: imageSource};
    }

    let genusQuery = url + genus;
    console.log(`Attempting to query genus on wiki...`)
    let genusText = await rp.get(genusQuery, getOpts).then(res => {
        let extract = res.query.pages[0].extract;
        return extract;
    }).catch((e) => {
        console.error(e.message);
    })

    if (genusText.length != 0) {
        let imageSource = await getWikiImage(genus);
        return {text: genusText, imageSource: imageSource};
    }

    return null;
}


async function getWikiImage(query) {
    let imageUrl = `${config.wikiUrl}?action=query&prop=pageimages` +
    `&exintro=&format=json&formatversion=2&pithumbsize=400&titles=`;

    let queryUrl = imageUrl + query;
    let data = await rp.get(queryUrl, getOpts).then(res => {
        console.log('image', JSON.stringify(res, null, 4))

        let imageSource = res.query.pages[0].thumbnail.source;
        console.log('\n\nimage response', JSON.stringify(imageSource))
        return imageSource;
    }).catch((e) => {
        console.error(e.message);
    })

    return data;
}


function getMeta(genomeID) {
    let url = `${config.dataAPIUrl}/genome/${genomeID}`;

    console.log(`fetching genome meta...`)
    return rp.get(url, getOpts).then(meta => {
        return meta;
    }).catch((e) => {
        console.error(e.message);
    })
}

function getGenomeQC(genomeID) {
    let url = `${config.dataAPIUrl}/genome_test/?eq(genome_id,${genomeID})&select(*)`;

    console.log(`fetching genome QC..`)
    return rp.get(url, getOpts).then(res => {
       //console.log('res', JSON.stringify(res, null, 4))
        return res;
    }).catch((e) => {
        console.error(e.message);
    })
}


function getAnnotationMeta(genomeID) {
    let url = `${config.dataAPIUrl}/genome_feature/?eq(genome_id,${genomeID})&limit(1)`+
        `&in(annotation,(PATRIC,RefSeq))&ne(feature_type,source)`+
        `&facet((pivot,(annotation,feature_type)),(mincount,0))&http_accept=application/solr+json`;

    console.log(`fetching anotation meta...`)
    return rp.get(url, getOpts).then(res => {
        //console.log('res', JSON.stringify(res, null, 4))
        let d = res.facet_counts.facet_pivot['annotation,feature_type'][0].pivot;

        let data  = d.map(o => {
            return {
                name: o.value,
                count: o.count
            }
        })

        return data;
    }).catch((e) => {
        console.error(e.message);
    })
}
